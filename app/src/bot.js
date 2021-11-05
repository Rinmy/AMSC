import { Client, Intents, MessageEmbed, MessageActionRow, MessageButton } from "discord.js";
import Compute from "@google-cloud/compute";
import Fs from "fs";
const CONFIG = JSON.parse(Fs.readFileSync("./config.json", "utf-8"));
const serverList = JSON.parse(Fs.readFileSync("./server.json", "utf-8"));
const compute = new Compute({
    projectId: CONFIG.gcp.project_id,
    keyFilename: "./api.json"
});
const discord = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS
    ]
});
const sleep = (seconds) => {
    return new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000);
    });
};
const appendLog = (content) => {
    const date = new Date();
    const currentTime = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}|${date.getHours()}:${date.getMinutes()}`;
    const log = `${currentTime}\n${content}\n\n---------------------\n\n`;
    Fs.appendFileSync("./error.log", log);
};
const getServerStatus = async (id) => {
    const server = serverList.server.filter((list) => {
        return list.discord_server_id === id;
    })[0];
    if (typeof server !== "undefined") {
        try {
            const zone = compute.zone(server.gcp_zone);
            const instance = zone.vm(server.gcp_instance);
            const data = await instance.get();
            const ip = data[0]["metadata"]["networkInterfaces"][0]["accessConfigs"][0]["natIP"];
            const status = data[0]["metadata"]["status"];
            return {
                status: status,
                ip: ip,
            };
        }
        catch (gcpError) {
            return {
                status: "ORIGINAL_FAILED",
                ip: "",
            };
        }
    }
    else {
        return {
            status: "",
            ip: "",
        };
    }
};
const startServer = async (id) => {
    const server = serverList.server.filter((list) => {
        return list.discord_server_id === id;
    })[0];
    if (typeof server !== "undefined") {
        try {
            const zone = compute.zone(server.gcp_zone);
            const instance = zone.vm(server.gcp_instance);
            await instance.start();
            return true;
        }
        catch (gcpError) {
            return false;
        }
    }
    else {
        return false;
    }
};
const stopServer = async (id) => {
    const server = serverList.server.filter((list) => {
        return list.discord_server_id === id;
    })[0];
    if (typeof server !== "undefined") {
        try {
            const zone = compute.zone(server.gcp_zone);
            const instance = zone.vm(server.gcp_instance);
            await instance.stop();
            return true;
        }
        catch (gcpError) {
            return false;
        }
    }
    else {
        return false;
    }
};
const createEmbed = (text, type, components) => {
    const embedImage = () => {
        switch (type) {
            case "default": return "";
            case "load": return "https://kuraline.jp/read/content/images/common/loading.gif";
            case "failed": return "https://icon-library.com/images/failed-icon/failed-icon-7.jpg";
            case "success": return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQVzP5dnyi1bktIciRYvDsDIZUsq-Ns_B1-DxD2_d_JxuVxvxEm8OqoLjw62hu_yDNfKfs&usqp=CAU";
            default: return "";
        }
    };
    const embed = new MessageEmbed()
        .setColor("#29B6F6")
        .setTitle("")
        .setAuthor(text, embedImage())
        .setDescription("");
    if (components !== null) {
        return {
            embeds: [embed],
            components: components,
        };
    }
    else {
        return {
            embeds: [embed],
            components: [],
        };
    }
};
const what = async (guildId) => {
    const selectButton = (type) => {
        switch (type) {
            case "update-status":
                return new MessageButton()
                    .setLabel("ステータス更新")
                    .setCustomId("update-status")
                    .setStyle("PRIMARY");
            case "start":
                return new MessageButton()
                    .setLabel("サーバー起動")
                    .setCustomId("start")
                    .setStyle("PRIMARY");
            case "stop":
                return new MessageButton()
                    .setLabel("サーバー停止")
                    .setCustomId("stop")
                    .setStyle("DANGER");
            case "register":
                return new MessageButton()
                    .setLabel("サーバー登録")
                    .setCustomId("register")
                    .setStyle("SUCCESS");
            case "reregister":
                return new MessageButton()
                    .setLabel("サーバー再登録")
                    .setCustomId("reregister")
                    .setStyle("SECONDARY");
            case "view-status":
                return new MessageButton()
                    .setLabel("ステータス")
                    .setURL(`https://mcsrvstat.us/server/${server.ip}`)
                    .setStyle("LINK");
            case "close":
                return new MessageButton()
                    .setLabel("閉じる")
                    .setCustomId("close")
                    .setStyle("DANGER");
        }
    };
    const server = await getServerStatus(guildId);
    let button;
    switch (server.status) {
        case "":
            button = new MessageActionRow()
                .addComponents(selectButton("register"))
                .addComponents(selectButton("update-status"))
                .addComponents(selectButton("close"));
            break;
        case "TERMINATED":
            button = new MessageActionRow()
                .addComponents(selectButton("start"))
                .addComponents(selectButton("update-status"))
                .addComponents(selectButton("reregister"))
                .addComponents(selectButton("close"));
            break;
        case "RUNNING":
            button = new MessageActionRow()
                .addComponents(selectButton("stop"))
                .addComponents(selectButton("update-status"))
                .addComponents(selectButton("view-status"))
                .addComponents(selectButton("close"));
            break;
        case "STOPPING":
        case "STAGING":
        default:
            button = new MessageActionRow()
                .addComponents(selectButton("update-status"))
                .addComponents(selectButton("reregister"))
                .addComponents(selectButton("close"));
            break;
    }
    return createEmbed("(。´・ω・)ん?", "default", [button]);
};
discord.on("messageCreate", async (message) => {
    if (message.author.bot || !message.mentions.has("875679319219925022")) {
        return;
    }
    try {
        message.delete();
        if (message.guild !== null) {
            const content = await what(message.guild.id);
            await message.channel.send(content);
        }
        else {
            throw new Error("guildなし...？ どゆこと？");
        }
    }
    catch (messageError) {
        appendLog(String(messageError));
    }
});
discord.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) {
        const interactionRegister = async () => {
            if (interaction.channel === null) {
                return;
            }
            await interaction.webhook.editMessage("@original", createEmbed("GCPインスタンス名を入力", "load", null));
            const instanceName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
            const instanceNameResponse = instanceName.first();
            if (!instanceNameResponse) {
                await interaction.webhook.editMessage("@original", createEmbed("登録失敗", "failed", null));
                return;
            }
            instanceNameResponse.delete();
            await interaction.webhook.editMessage("@original", createEmbed("ゾーンを入力", "load", null));
            const zoneName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
            const zoneNameResponse = zoneName.first();
            if (!zoneNameResponse) {
                await interaction.webhook.editMessage("@original", createEmbed("登録失敗", "failed", null));
                return;
            }
            zoneNameResponse.delete();
            const server = serverList.server.filter((list) => {
                return list.discord_server_id === interaction.guildId;
            })[0];
            if (typeof server !== "undefined") {
                await interaction.webhook.editMessage("@original", createEmbed("ご安心を！サーバーが既に登録されてます！", "failed", null));
                return;
            }
            serverList.server.push({
                discord_server_id: interaction.guildId,
                gcp_instance: instanceNameResponse.content,
                gcp_zone: zoneNameResponse.content,
            });
            console.log(serverList);
            Fs.writeFileSync(`./server.json`, JSON.stringify(serverList));
            await interaction.webhook.editMessage("@original", createEmbed("登録完了", "success", null));
        };
        const interactionReregister = async () => {
            if (interaction.channel === null) {
                return;
            }
            await interaction.webhook.editMessage("@original", createEmbed("GCPインスタンス名を入力", "load", null));
            const instanceName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
            const instanceNameResponse = instanceName.first();
            if (!instanceNameResponse) {
                await interaction.webhook.editMessage("@original", createEmbed("登録失敗", "failed", null));
                return;
            }
            instanceNameResponse.delete();
            await interaction.webhook.editMessage("@original", createEmbed("ゾーンを入力", "load", null));
            const zoneName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
            const zoneNameResponse = zoneName.first();
            if (!zoneNameResponse) {
                await interaction.webhook.editMessage("@original", createEmbed("登録失敗", "failed", null));
                return;
            }
            zoneNameResponse.delete();
            const server = serverList.server.filter((list) => {
                return list.discord_server_id === interaction.guildId;
            })[0];
            if (typeof server === "undefined") {
                await interaction.webhook.editMessage("@original", createEmbed("登録失敗", "failed", null));
                return;
            }
            server.gcp_instance = instanceNameResponse.content;
            server.gcp_zone = zoneNameResponse.content;
            Fs.writeFileSync(`./server.json`, JSON.stringify(serverList));
            await interaction.webhook.editMessage("@original", createEmbed("登録完了", "success", null));
        };
        const interactionUpdateStatus = async () => {
            const content = await what(interaction.guildId);
            if (interaction.channel !== null) {
                await interaction.webhook.deleteMessage("@original");
                await interaction.channel.send(content);
            }
            else {
                await interaction.webhook.editMessage("@original", createEmbed("(´・ω・`)？", "failed", null));
            }
        };
        const interactionStart = async () => {
            await interaction.webhook.editMessage("@original", createEmbed("起動中", "load", null));
            if (!(await startServer(interaction.guildId))) {
                await interaction.webhook.editMessage("@original", createEmbed("起動失敗", "failed", null));
                return;
            }
            for (let i = 0; i < 5; i++) {
                await sleep(5);
                const server = await getServerStatus(interaction.guildId);
                if (server.status === "RUNNING") {
                    await interaction.webhook.editMessage("@original", createEmbed("起動完了", "success", null));
                    await sleep(4);
                    break;
                }
            }
            const content = await what(interaction.guildId);
            if (interaction.channel !== null) {
                await interaction.webhook.deleteMessage("@original");
                await interaction.channel.send(content);
            }
        };
        const interactionStop = async () => {
            await interaction.webhook.editMessage("@original", createEmbed("停止中", "load", null));
            if (!(await stopServer(interaction.guildId))) {
                await interaction.webhook.editMessage("@original", createEmbed("停止失敗", "failed", null));
                return;
            }
            for (let i = 0; i < 8; i++) {
                await sleep(5);
                const server = await getServerStatus(interaction.guildId);
                if (server.status === "TERMINATED") {
                    await interaction.webhook.editMessage("@original", createEmbed("停止完了", "failed", null));
                    await sleep(4);
                    break;
                }
            }
            const content = await what(interaction.guildId);
            if (interaction.channel !== null) {
                await interaction.webhook.deleteMessage("@original");
                await interaction.channel.send(content);
            }
        };
        try {
            await interaction.update(createEmbed("ㅤ", "default", null));
            switch (interaction.customId) {
                case "update-status":
                    await interactionUpdateStatus();
                    break;
                case "start":
                    await interactionStart();
                    break;
                case "stop":
                    await interactionStop();
                    break;
                case "register":
                    await interactionRegister();
                    break;
                case "reregister":
                    await interactionReregister();
                    break;
                case "close":
                    await interaction.webhook.deleteMessage("@original");
                    break;
                default:
                    await interaction.webhook.editMessage("@original", createEmbed("(´・ω・`)？", "default", null));
                    break;
            }
        }
        catch (buttonError) {
            appendLog(String(buttonError));
        }
    }
});
discord.login(CONFIG.discord.token);
