import {
    Controller,
    Command,
    Option,
    AppEventsService,
    ProjectService
} from "@wocker/core";
import {promptConfirm, promptText} from "@wocker/utils";

import {ServeoService} from "../services/ServeoService";
import {ENABLE_KEY, SUBDOMAIN_KEY} from "../env";


@Controller()
export class ServeoController {
    public constructor(
        protected readonly appEventsService: AppEventsService,
        protected readonly projectService: ProjectService,
        protected readonly serveoService: ServeoService
    ) {
        this.appEventsService.on("project:start", (project) => {
            return this.serveoService.onStart(project);
        });

        this.appEventsService.on("project:stop", (project) => {
            return this.serveoService.onStop(project);
        });
    }

    @Command("serveo:init")
    public async init(
        @Option("name", {
            type: "string",
            alias: "n",
            description: "Project name"
        })
        name?: string
    ): Promise<void> {
        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        const enabled = await promptConfirm({
            message: "Enable Serveo?",
            default: this.serveoService.isEnabled(project)
        });

        if(enabled) {
            const subdomain = await promptText({
                message: "Subdomain: ",
                prefix: "https://",
                suffix: ".serveo.net",
                default: project.getMeta(SUBDOMAIN_KEY, project.name)
            });

            project.setMeta(ENABLE_KEY, enabled);
            project.setMeta(SUBDOMAIN_KEY, subdomain);
        }
        else {
            project.unsetMeta(ENABLE_KEY);
            project.unsetMeta(SUBDOMAIN_KEY);
        }

        await project.save();
    }

    @Command("serveo:start")
    public async start(
        @Option("name", {
            type: "string",
            alias: "n",
            description: "Project name"
        })
        name?: string,
        @Option("restart", {
            type: "boolean",
            alias: "r",
            description: "Restarting"
        })
        restart?: boolean,
        @Option("build", {
            type: "boolean",
            alias: "b",
            description: "Build image"
        })
        build?: boolean
    ): Promise<void> {
        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        if(restart || build) {
            await this.serveoService.stop(project);
        }

        await this.serveoService.build(build);
        await this.serveoService.start(project, restart);
    }

    @Command("serveo:stop")
    public async stop(
        @Option("name", {
            type: "string",
            alias: "n",
            description: "Project name"
        })
        name?: string
    ): Promise<void> {
        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        await this.serveoService.stop(project);
    }

    @Command("serveo:logs")
    public async logs(
        @Option("name", {
            type: "string",
            alias: "n",
            description: "Project name"
        })
        name?: string
    ): Promise<void> {
        if(name) {
            await this.projectService.cdProject(name);
        }

        const project = await this.projectService.get();

        await this.serveoService.logs(project);
    }
}
