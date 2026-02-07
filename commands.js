require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ルフィ")
    .setDescription("ルフィ操作コマンド")
    .addSubcommand((sub) =>
      sub.setName("join").setDescription("固定VCに常駐（接続）")
    )
    .addSubcommand((sub) =>
      sub.setName("sound").setDescription("固定VCでランダムSEを再生")
    )
    .addSubcommand((sub) =>
      sub.setName("dc").setDescription("固定VCから退出（切断）")
    ),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("⏳ コマンド登録中...");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ コマンド登録完了");
  } catch (e) {
    console.error(e);
  }
})();