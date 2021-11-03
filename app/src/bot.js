import { Client, Intents, MessageEmbed, MessageActionRow, MessageButton, } from "discord.js";
import Compute from "@google-cloud/compute";
import Fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONFIG = JSON.parse(Fs.readFileSync(`${__dirname}/config.json`, "utf-8"));
const serverList = JSON.parse(Fs.readFileSync(`${__dirname}/server.json`, "utf-8"));
const compute = new Compute({
    projectId: CONFIG.gcp.project_id,
    keyFilename: "./api.json",
});
const discord = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
});
const sleep = (seconds) => {
    new Promise((resolve) => {
        setTimeout(resolve, seconds);
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
    else {
        return {
            status: "",
            ip: "",
        };
    }
};
const what = async (guildId) => {
    const server = await getServerStatus(guildId);
    const embed = new MessageEmbed()
        .setColor("#29B6F6")
        .setTitle("")
        .setAuthor("(。´・ω・)ん?")
        .setDescription("");
    const updateStatusButton = new MessageActionRow().addComponents(new MessageButton()
        .setLabel("ステータス更新")
        .setCustomId("update-status")
        .setStyle("PRIMARY"));
    const startButton = new MessageActionRow().addComponents(new MessageButton()
        .setLabel("サーバー起動")
        .setCustomId("start")
        .setStyle("PRIMARY"));
    const stopButton = new MessageActionRow().addComponents(new MessageButton()
        .setLabel("サーバー停止")
        .setCustomId("stop")
        .setStyle("DANGER"));
    const registerButton = new MessageActionRow().addComponents(new MessageButton()
        .setLabel("サーバー登録")
        .setCustomId("register")
        .setStyle("SUCCESS"));
    const viewStatusButton = new MessageActionRow().addComponents(new MessageButton()
        .setLabel("ステータス")
        .setURL(`https://mcsrvstat.us/server/${server.ip}`)
        .setStyle("LINK"));
    const closeButton = new MessageActionRow().addComponents(new MessageButton().setLabel("閉じる").setCustomId("close").setStyle("DANGER"));
    let components;
    switch (server.status) {
        case "":
            components = [registerButton, updateStatusButton, closeButton];
            break;
        case "TERMINATED":
            components = [startButton, updateStatusButton, closeButton];
            break;
        case "RUNNING":
            components = [stopButton, updateStatusButton, viewStatusButton, closeButton];
            break;
        case "STOPPING":
            components = [updateStatusButton, closeButton];
            break;
        case "STAGING":
            components = [updateStatusButton, closeButton];
            break;
        default:
            components = [updateStatusButton, closeButton];
            break;
    }
    return {
        embeds: [embed],
        components: components,
    };
};
discord.on("messageCreate", async (message) => {
    if (message.author.bot) {
        return;
    }
    try {
        message.delete();
        if (message.guild !== null) {
            const content = await what(message.guild.id);
            message.channel.send(content);
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
        const register = async () => {
            interaction.update("登録中です。");
            serverList.server.push({
                discord_server_id: interaction.guildId,
                gcp_instance: "test",
                gcp_zone: "test2",
            });
            Fs.writeFileSync(`${__dirname}/server.json`, JSON.stringify(serverList));
            interaction.update("登録しました。");
        };
        try {
            switch (interaction.customId) {
                case "update-status":
                    const content = await what(interaction.guildId);
                    interaction.update(content);
                    break;
                case "start":
                    interaction.update("起動");
                    break;
                case "stop":
                    interaction.update("停止");
                    break;
                case "register":
                    await register();
                    break;
                case "close":
                    await interaction.webhook.deleteMessage("@original");
                    break;
                default:
                    interaction.update("(´・ω・`)知らんがな");
                    break;
            }
        }
        catch (buttonError) {
            appendLog(String(buttonError));
        }
    }
});
discord.login(CONFIG.discord.token);
