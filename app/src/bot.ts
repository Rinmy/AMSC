import { Client, Intents, MessageEmbed, MessageActionRow, MessageButton, Message } from "discord.js";
// @ts-expect-error
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

// zzZ
const sleep = (seconds: number) => {
	new Promise((resolve) => {
		setTimeout(resolve, seconds);
	});
};

// ログ
const appendLog = (content: string) => {
	const date = new Date();
	const currentTime = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}|${date.getHours()}:${date.getMinutes()}`;
	const log = `${currentTime}\n${content}\n\n---------------------\n\n`;

	Fs.appendFileSync("./error.log", log);
};

// GCPサーバーの状態チェック
const getServerStatus = async (id: string) => {
	interface serverData {
		discord_server_id: string;
		gcp_instance: string;
		gcp_zone: string;
	}

	const server = serverList.server.filter((list: serverData) => {
		return list.discord_server_id === id;
	})[0];

	if (typeof server !== "undefined") {
		const zone = compute.zone(server.gcp_zone);
		const instance = zone.vm(server.gcp_instance);
		const data = await instance.get();

		const ip =
			data[0]["metadata"]["networkInterfaces"][0]["accessConfigs"][0]["natIP"];
		const status = data[0]["metadata"]["status"];

		return {
			status: status,
			ip: ip,
		};
	} else {
		return {
			status: "",
			ip: "",
		};
	}
};

const createEmbed = (text: string, type: "load" | "success" | "default", components: null | MessageActionRow[]) => {
	const embedImage = () => {
		switch (type) {
			case "default": return "";
			case "load": return "https://kuraline.jp/read/content/images/common/loading.gif";
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
	} else {
		return {
			embeds: [embed],
			components: [],
		};
	}
};

// 要望聞く
const what = async (guildId: string) => {
	const server = await getServerStatus(guildId);

	const updateStatusButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("ステータス更新")
			.setCustomId("update-status")
			.setStyle("PRIMARY")
	);

	const startButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("サーバー起動")
			.setCustomId("start")
			.setStyle("PRIMARY")
	);

	const stopButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("サーバー停止")
			.setCustomId("stop")
			.setStyle("DANGER")
	);

	const registerButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("サーバー登録")
			.setCustomId("register")
			.setStyle("SUCCESS")
	);

	const viewStatusButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("ステータス")
			.setURL(`https://mcsrvstat.us/server/${server.ip}`)
			.setStyle("LINK")
	);

	const closeButton = new MessageActionRow().addComponents(
		new MessageButton()
			.setLabel("閉じる")
			.setCustomId("close")
			.setStyle("DANGER")
	);

	let components: MessageActionRow[];
	switch (server.status) {
		// サーバー登録なし
		case "":
			components = [registerButton, updateStatusButton, closeButton];
			break;

		// 停止状態
		case "TERMINATED":
			components = [startButton, updateStatusButton, closeButton];
			break;

		// 動作中
		case "RUNNING":
			components = [stopButton, updateStatusButton, viewStatusButton, closeButton];
			break;

		// 停止処理中
		case "STOPPING":
			components = [updateStatusButton, closeButton];
			break;

		// 起動処理中
		case "STAGING":
			components = [updateStatusButton, closeButton];
			break;

		// 不明
		default:
			components = [updateStatusButton, closeButton];
			break;
	}

	return createEmbed("(。´・ω・)ん?", "default", components);
};

discord.on("messageCreate", async (message: Message) => {
	if (message.author.bot || !message.mentions.has("875679319219925022")) {
		return;
	}

	try {
		message.delete();

		if (message.guild !== null) {
			const content = await what(message.guild.id);
			message.channel.send(content);
		} else {
			throw new Error("guildなし...？ どゆこと？");
		}
	} catch (messageError) {
		appendLog(String(messageError));
	}
});

discord.on("interactionCreate", async (interaction) => {
	if (interaction.isButton()) {
		const interactionRegister = async () => {
			if (interaction.channel === null) {
				return;
			}

			//const webhook = interaction.webhook;
			//webhook.editMessage("@original", "aaa");

			//await interaction.update(createEmbed("GCPインスタンス名を入力", "load", null));

			const instanceName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
			const instanceNameResponse = instanceName.first();
			if (!instanceNameResponse) {
				await interaction.update(createEmbed("登録失敗", "default", null));
				return;
			}

			console.log(instanceNameResponse.content);

			await interaction.update(createEmbed("ゾーンを入力", "load", null));

			const zoneName = await interaction.channel.awaitMessages({ max: 1, time: 20 * 1000 });
			const zoneNameResponse = zoneName.first();
			if (!zoneNameResponse) {
				await interaction.update(createEmbed("登録失敗", "default", null));
				return;
			}

			console.log(zoneNameResponse.content);

			/*serverList.server.push({
				discord_server_id: interaction.guildId,
				gcp_instance: "test",
				gcp_zone: "test2",
			});

			Fs.writeFileSync(`./server.json`, JSON.stringify(serverList));*/

			await interaction.update(createEmbed("登録完了", "success", null));
		};

		const interactionUpdateStatus = async () => {
			const content = await what(interaction.guildId);
			await interaction.update(content);
		};

		const interactionStart = async () => {
			await interaction.update(createEmbed("起動中", "load", null));

			for (let i = 0; i < 5; i++) {
				await sleep(5);
				const server = await getServerStatus(interaction.guildId);
				if (server.status === "RUNNING" || "TERMINATED") {
					if (server.status === "RUNNING") {
						await interaction.update(createEmbed("起動完了", "success", null));
						sleep(4);
					}
					break;
				}
			}

			const content = await what(interaction.guildId);
			await interaction.update(content);
		};

		const interactionStop = async () => {
			await interaction.update(createEmbed("停止中", "load", null));

			for (let i = 0; i < 5; i++) {
				await sleep(5);
				const server = await getServerStatus(interaction.guildId);
				if (server.status === "RUNNING" || "TERMINATED") {
					if (server.status === "TERMINATED") {
						await interaction.update(createEmbed("停止完了", "success", null));
						sleep(4);
					}
					break;
				}
			}

			const content = await what(interaction.guildId);
			await interaction.update(content);
		};

		try {
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

				default:
					await interaction.update(createEmbed("(´・ω・`)？", "default", null));
					break;
			}
		} catch (buttonError) {
			appendLog(String(buttonError));
		}
	}
});

discord.login(CONFIG.discord.token);
