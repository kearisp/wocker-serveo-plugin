import {
    Injectable,
    AppConfigService,
    AppEventsService,
    ProjectService,
    DockerService,
    Cli,
    Plugin,
    Project,
    Logger
} from "@wocker/core";
import {promptConfirm, promptText} from "@wocker/utils";
import * as FS from "fs";
import * as Path from "path";


type InitOptions = {
    name?: string;
};

type StartOptions = {
    name?: string;
    detach?: boolean;
    rebuild?: boolean;
};

type StopOptions = {
    name?: string;
};

type RestartOptions = {
    name?: string;
};

type LogsOptions = {
    name?: string;
};

@Injectable()
export class ServeoPlugin extends Plugin {
    protected image = "ws-serveo";

    public constructor(
        protected appConfigService: AppConfigService,
        protected appEventsService: AppEventsService,
        protected projectService: ProjectService,
        protected dockerService: DockerService
    ) {
        super();
    }

    public install(cli: Cli): void {
        super.install(cli);

        this.appEventsService.on("project:start", (project) => this.onProjectStart(project));
        this.appEventsService.on("project:stop", (project) => this.onProjectStop(project));

        cli.command("serveo:init")
            .option("name", {
                alias: "n",
                type: "string",
                description: "Project name"
            })
            .action((options: InitOptions) => this.init(options));

        cli.command("serveo:start")
            .option("name", {
                alias: "n",
                type: "string",
                description: "Project name"
            })
            .option("detach", {
                type: "boolean",
                alias: "d",
                description: "Detach"
            })
            .option("rebuild", {
                alias: "r",
                type: "boolean",
                description: "Rebuild"
            })
            .action((options: StartOptions) => this.start(options));

        cli.command("serveo:stop")
            .option("name", {
                alias: "n",
                type: "string",
                description: "Project name"
            })
            .action((options: StopOptions) => this.stop(options));

        cli.command("serveo:restart")
            .option("name", {
                type: "string",
                alias: "n",
                description: "Project name"
            })
            .action((options: RestartOptions) => this.restart(options));

        cli.command("serveo:build")
            .action(() => this.build());

        cli.command("serveo:logs")
            .option("name", {
                type: "string",
                alias: "n",
                description: "Project name"
            })
            .action((options: LogsOptions) => this.logs(options));
    }

    public async init(options: InitOptions) {
        const {
            name
        } = options;

        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        const enabled = await promptConfirm({
            message: "Enable Serveo?",
            default: project.getEnv("SERVEO_ENABLE", "true") === "true"
        });

        if(enabled) {
            const subdomain = await promptText({
                message: "Subdomain: ",
                prefix: "https://",
                suffix: ".serveo.net",
                default: project.getEnv("SEVEO_SUBDOMAIN", project.name) as string
            });

            project.setEnv("SERVEO_ENABLE", "true");
            project.setEnv("SERVEO_SUBDOMAIN", subdomain);
        }
        else {
            project.setEnv("SERVEO_ENABLE", "false");
        }

        await project.save();
    }

    public async start(options: StartOptions) {
        const {
            name,
            rebuild
        } = options;

        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        if(rebuild) {
            await this.rebuild();
        }

        await this.onProjectStart(project);
    }

    public async stop(options: StopOptions) {
        const {
            name
        } = options;

        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        await this.onProjectStop(project);
    }

    public async restart(options: RestartOptions) {
        const {
            name
        } = options;

        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        await this.onProjectStop(project);
        await this.onProjectStart(project);
    }

    public async onProjectStart(project: Project) {
        if(!project || project.getEnv("SERVEO_ENABLE", "false") !== "true") {
            return;
        }

        console.info("Serveo starting...");

        Logger.info(">_<");

        await this.build();

        await this.dockerService.removeContainer(`serveo-${project.id}`);

        const subdomain = project.getEnv("SERVEO_SUBDOMAIN")

        let container = await this.dockerService.getContainer(`serveo-${project.id}`);

        if(container) {
            const {
                State: {
                    Running
                }
            } = await container.inspect();

            if(Running) {
                console.info("Serveo is already running");
                return;
            }
        }
        else {
            await this.dockerService.removeContainer(`serveo-${project.id}`);
        }

        const sshDir = this.appConfigService.dataPath("plugins", "serveo", ".ssh");

        if(!FS.existsSync(sshDir)) {
            FS.mkdirSync(sshDir, {
                recursive: true
            });
        }

        container = await this.dockerService.createContainer({
            name: `serveo-${project.id}`,
            image: "ws-serveo",
            tty: true,
            restart: "always",
            volumes: [`${sshDir}:/home/user/.ssh`]
        });

        const stream = await container.attach({
            stream: true,
            stdin: true,
            stdout: true,
            stderr: true,
            hijack: true,
            logs: true
        });

        await container.start();

        await container.resize({
            w: process.stdout.columns,
            h: process.stdout.rows
        });

        const files = FS.readdirSync(sshDir);

        if(files.length === 0) {
            stream.write("ssh-keygen -q -t rsa -N '' -f ~/.ssh/id_rsa\n");
        }
        else {
            Logger.info(files);
        }

        stream.write(`autossh -R ${subdomain ? `${subdomain}.serveo.net:` : ""}80:${project.name}.workspace:80 serveo.net\n`);

        stream.on("data", (data) => {
            // Logger.log(data.toString());

            if(/Forwarding HTTP traffic/.test(data.toString())) {
                stream.end();
            }
        });

        await this.dockerService.attachStream(stream);
    }

    public async onProjectStop(project: Project) {
        if(!project || project.getEnv("SERVEO_ENABLE", "false") !== "true") {
            return;
        }

        console.info("Serveo stopping...");

        await this.dockerService.removeContainer(`serveo-${project.id}`);
    }

    public async build() {
        const exists = await this.dockerService.imageExists(this.image);

        if(!exists) {
            await this.dockerService.buildImage({
                tag: this.image,
                context: Path.resolve(__dirname, "..", "data"),
                src: "./Dockerfile"
            });
        }
    }

    public async rebuild() {
        const exists = await this.dockerService.imageExists("ws-serveo");

        if(!exists) {
            await this.dockerService.imageRm("ws-serveo");
        }

        await this.build();
    }

    public async logs(options: LogsOptions) {
        const {
            name
        } = options;

        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        const container = await this.dockerService.getContainer(`serveo-${project.id}`);

        if(!container) {
            return;
        }

        const stream = await container.logs({
            follow: true,
            stderr: true,
            stdout: true,
            tail: 5
        });

        stream.on("data", (data) => {
            process.stdout.write(data);
        });

        stream.on("error", (data) => {
            process.stderr.write(data);
        });
    }
}
