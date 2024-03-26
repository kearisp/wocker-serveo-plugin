import {Module, PluginConfigService} from "@wocker/core";

import {ServeoController} from "./controllers/ServeoController";
import {ServeoService} from "./services/ServeoService";


@Module({
    name: "serveo",
    controllers: [
        ServeoController
    ],
    providers: [
        ServeoService,
        PluginConfigService
    ]
})
export default class ServeoModule {}
