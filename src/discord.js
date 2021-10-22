const Discord = require("discord.js");
const Fs = require("fs");
const Compute = require("@google-cloud/compute");

// このプログラムに必要なコンフィグ
const CONFIG = require("./config.json");

const compute = new Compute({
	projectId: CONFIG["gcp"]["project_id"],
	keyFilename: "./api.json",
});

const discord = new Discord.Client({
	intents: [Discord.Intents.FLAGS.GUILDS],
});

function sleep(seconds) {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve();
		}, seconds);
	});
}

function appendLog(content) {
	const date = new Date();
	const currentTime = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}|${date.getHours()}:${date.getMinutes()}`;
	const log = `${currentTime}\n${content}\n\n---------------------\n\n`;

	Fs.appendFileSync("./error.log", log);
}

class Commands {
	constructor(command, interactionId, token, webhook, guildId, options = null) {
		this.command = command;
		this.interactionId = interactionId;
		this.token = token;
		this.webhook = webhook;
		this.guildId = guildId;
		this.instance = "";
		this.options = options;
	}

	embedIcon(type) {
		switch (type) {
			case "on":
				return "https://mtail3x.wpblog.jp/wp-content/uploads/2017/12/power.png";
			case "off":
				return "https://mtail3x.wpblog.jp/wp-content/uploads/2017/12/Power_off.png";
			case "success":
				return "https://freeiconshop.com/wp-content/uploads/edd/checkmark-flat.png";
			case "failed":
				return "https://icon-library.com/images/failed-icon/failed-icon-7.jpg";
			case "load":
				return "https://i.stack.imgur.com/kOnzy.gif";
			case "question":
				return "https://icooon-mono.com/i/icon_11571/icon_115710_256.png";
			default:
				return "https://icooon-mono.com/i/icon_11571/icon_115710_256.png";
		}
	}

	embedColor(type) {
		switch (type) {
			case "on":
				return 2001125;
			case "off":
				return 16725063;
			case "success":
				return 3270553;
			case "failed":
				return 16725063;
			case "load":
				return 0;
			case "question":
				return 14135295;
			default:
				return 0;
		}
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

discord.on("interactionCreate", (interaction) => {
	if (!interaction.isCommand()) {
		return;
	}

	command = new Commands(interaction.commandName, interaction.id, interaction.token, interaction.webhook, interaction.guildId, interaction.options);
	command.do();
});

discord.login(CONFIG["bot"]["token"]);
