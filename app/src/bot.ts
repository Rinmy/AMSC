import {
	Client,
	Intents,
	MessageEmbed,
	MessageActionRow,
	MessageButton,
	Message,
} from "discord.js";
// @ts-expect-error
import Compute from "@google-cloud/compute";
import Fs from "fs";
import {fileURLToPath} from "url";
import {dirname} from "path";

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

// zzZ
const sleep = (seconds: number): void => {
	new Promise((resolve) => {
		setTimeout(resolve, seconds);
	});
};

// ログ
const appendLog = (content: string): void => {
	const date = new Date();
	const currentTime = `${date.getFullYear()}.${
		date.getMonth() + 1
	}.${date.getDate()}|${date.getHours()}:${date.getMinutes()}`;
	const log = `${currentTime}\n${content}\n\n---------------------\n\n`;

	Fs.appendFileSync("./error.log", log);
};

// Minecraftサーバーの状態チェック
interface serverStatus {
	status: string;
	ip: string;
}
const getServerStatus = async (id: string): Promise<serverStatus> => {
	interface serverData {
		discord_server_id: string;
		gcp_instance: string;
		gcp_zone: string;
	}

	const server = serverList.server.filter((list: serverData): boolean => {
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

// 要望聞く
interface whatSay {
	embeds: MessageEmbed[];
	components: MessageActionRow[];
}
const what = async (guildId: string): Promise<whatSay> => {
	const server: serverStatus = await getServerStatus(guildId);

	const embed = new MessageEmbed()
		.setColor("#29B6F6")
		.setTitle("")
		.setAuthor("(。´・ω・)ん?")
		.setDescription("");

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
		new MessageButton().setLabel("閉じる").setCustomId("close").setStyle("DANGER")
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

	return {
		embeds: [embed],
		components: components,
	};
};

discord.on("messageCreate", async (message: Message): Promise<void> => {
	if (message.author.bot) {
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

discord.on("interactionCreate", async (interaction): Promise<void> => {
	if (interaction.isButton()) {
		const register = async (): Promise<void> => {
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
					interaction.webhook.deleteMessage("@original");
					break;

				default:
					interaction.update("(´・ω・`)知らんがな");
					break;
			}
		} catch (buttonError) {
			appendLog(String(buttonError));
		}
	}
});

discord.login(CONFIG.discord.token);

/*class Commands {
	constructor(command, interactionId, token, webhook, guildId, options = null) {
		this.command = command;
		this.interactionId = interactionId;
		this.token = token;
		this.webhook = webhook;
		this.guildId = guildId;
		this.instance = "";
		this.options = options;
	}

	async callback(message, type) {
		await discord.api.interactions(this.interactionId, this.token).callback.post({
			data: {
				type: 4,
				data: {
					content: "ㅤ",
					embeds: [
						{
							title: "",
							color: this.embedColor(type),
							author: {
								name: message,
								icon_url: this.embedIcon(type),
							},
							description: "",
						},
					],
				},
			},
		});
	}

	async edit(message, type, description = "") {
		await this.webhook.editMessage("@original", {
			content: "ㅤ",
			embeds: [
				{
					title: "",
					color: this.embedColor(type),
					author: {
						name: message,
						icon_url: this.embedIcon(type),
					},
					description: description,
				},
			],
		});
	}

	async delete() {
		await this.webhook.deleteMessage("@original");
	}

	async status() {
		const data = await this.instance.get();

		if (data[0]["metadata"]["networkInterfaces"][0]["accessConfigs"][0]["natIP"] !== void 0) {
			discord.user.setActivity(data[0]["metadata"]["networkInterfaces"][0]["accessConfigs"][0]["natIP"], {type: "LISTENING"});
		} else {
			discord.user.setActivity("", {type: "STREAMING"});
		}

		return data[0]["metadata"]["status"];
	}

	async start() {
		const data = await this.instance.start();
		return data[0]["metadata"]["status"];
	}

	async stop() {
		const data = await this.instance.stop();
		return data[0]["metadata"]["status"];
	}

	async do() {
		try {
			if (this.command !== "add" && CONFIG["server"][this.guildId] === void 0) {
				await this.callback("サーバーを登録してください", "failed");
			} else {
				if (this.command !== "add") {
					const zone = compute.zone(CONFIG["server"][this.guildId]["zone"]);
					this.instance = zone.vm(CONFIG["server"][this.guildId]["instance"]);
				}

				let status;
				switch (this.command) {
					case "status":
						await this.callback("サーバーへ接続中です", "load");

						status = await this.status();
						switch (status) {
							case "TERMINATED":
								await this.edit("サーバーは現在停止中です", "off");
								break;

							case "RUNNING":
								await this.edit("サーバーは現在動作中です", "on");
								break;

							case "STOPPING":
								await this.edit("サーバーは現在停止処理中", "off");
								break;

							case "STAGING":
								await this.edit("サーバーは現在起動処理中", "off");
								break;

							default:
								await this.edit("サーバーの状態が不明です", "question");
								break;
						}
						break;

					case "start":
						await this.callback("サーバーへ接続中です", "load");

						status = await this.status();
						if (status === "TERMINATED") {
							if ((await this.start()) === "RUNNING") {
								await this.edit("サーバーを起動中です", "load");

								for (let i = 0; i < 10; i++) {
									if (i >= 4) {
										await this.edit("タイムアウトしました。", "off", "数分後に状態の確認をおすすめします。");
										break;
									}
									await sleep(6000);

									status = await this.status();
									if (status === "RUNNING") {
										await this.edit("サーバーを起動しました", "success", "約1分後にログイン可能です。");
										break;
									}
								}
							} else {
								await this.edit("サーバーを起動できませんでした。", "failed");
							}
						} else {
							switch (status) {
								case "RUNNING":
									await this.edit("サーバーは既に起動しています", "failed");
									break;

								case "STOPPING":
									await this.edit("サーバーは現在停止処理中なので、起動できません", "failed");
									break;

								case "STAGING":
									await this.edit("サーバーは既に起動処理中です。", "failed");
									break;

								default:
									await this.edit("サーバーの状態が不明なので、起動できません", "failed");
									break;
							}
						}
						break;

					case "stop":
						await this.callback("サーバーへ接続中です", "load");

						status = await this.status();
						if (status === "RUNNING") {
							await this.edit("サーバーを停止中です", "load");

							if ((await this.stop()) === "RUNNING") {
								for (let i = 0; i < 10; i++) {
									if (i >= 8) {
										await this.edit("タイムアウトしました。", "off", "数分後に状態の確認をおすすめします。");
										break;
									}
									await sleep(6000);

									status = await this.status();
									if (status === "TERMINATED") {
										await this.edit("サーバーを停止しました", "success");
										break;
									}
								}
							} else {
								await this.edit("サーバーを停止できませんでした。", "failed");
							}
						} else {
							switch (status) {
								case "TERMINATED":
									await this.edit("サーバーは既に停止しています", "failed");
									break;

								case "STOPPING":
									await this.edit("サーバーは既に停止処理中です。", "failed");
									break;

								case "STAGING":
									await this.edit("サーバーは現在起動処理中なので、停止できません", "failed");
									break;

								default:
									await this.edit("サーバーの状態が不明なので、停止できません", "failed");
									break;
							}
						}
						break;

					case "add":
						await this.callback("登録中です", "load");

						CONFIG["server"][this.guildId] = {
							instance: this.options.getString("instance"),
							zone: this.options.getString("zone"),
						};
						Fs.writeFileSync("./config.json", JSON.stringify(CONFIG));

						await this.edit("登録しました", "success", `インスタンス：${CONFIG["server"][this.guildId]["instance"]}\nゾーン：${CONFIG["server"][this.guildId]["zone"]}`);
						break;

					default:
						this.callback("不明なコマンドです", "failed");
						break;
				}
			}

			await sleep(10000);
			await this.delete();
		} catch (error1) {
			try {
				await this.edit("エラーが発生しました", "failed", error1.message);
			} catch (error2) {
				appendLog(error2.message);
			}
			appendLog(error1.message);
		}
	}
}
*/
