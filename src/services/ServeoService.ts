import {
    Injectable,
    AppConfigService,
    PluginConfigService,
    DockerService,
    LogService
} from "@wocker/core";
import * as Path from "path";
import {existsSync, mkdirSync, readdirSync} from "fs";

import {ENABLE_KEY, SUBDOMAIN_KEY} from "../env";


@Injectable()
export class ServeoService {
    public constructor(
        protected readonly appConfigService: AppConfigService,
        protected readonly pluginConfigService: PluginConfigService,
        protected readonly dockerService: DockerService,
        protected readonly logService: LogService
    ) {}

    get imageName() {
        return "wocker-serveo";
    }

    public async start(project: any, restart?: boolean) {
        if(!project || project.getMeta(ENABLE_KEY, "false") !== "true") {
            return;
        }

        if(restart) {
            await this.stop(project);
        }

        console.info("Serveo starting...");

        const subdomain = project.getMeta(SUBDOMAIN_KEY);

        let container = await this.dockerService.getContainer(`serveo-${project.id}`);

        if(container) {
            const {
                State: {
                    Running
                }
            } = await container.inspect();

            if(Running) {
                console.info("Serveo is already running")
                return;
            }
        }
        else {
            await this.dockerService.removeContainer(`serveo-${project.id}`);
        }

        const sshDir = this.pluginConfigService.dataPath(".ssh");

        if(!existsSync(sshDir)) {
            mkdirSync(sshDir, {
                recursive: true
            });
        }

        container = await this.dockerService.createContainer({
            name: `serveo-${project.id}`,
            image: this.imageName,
            tty: true,
            restart: "always",
            volumes: [`${sshDir}:/home/user/.ssh`],
            env: {
                SUBDOMAIN: subdomain,
                CONTAINER: project.containerName
            }
        });

        await container.start();
    }

    public async stop(project: any) {
        console.info("Serveo stopping...");

        await this.dockerService.removeContainer(`serveo-${project.id}`);
    }

    public async build(rebuild?: boolean) {
        if(await this.dockerService.imageExists(this.imageName)) {
            if(!rebuild) {
                return;
            }

            await this.dockerService.imageRm(this.imageName);
        }

        await this.dockerService.buildImage({
            tag: this.imageName,
            context: Path.join(__dirname, "../../plugin"),
            src: "./Dockerfile"
        });
    }

    public async logs(project: any) {
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

        stream.on("data", (data: any) => {
            process.stdout.write(data);
        });

        stream.on("error", (data: any) => {
            process.stderr.write(data);
        });
    }
}
