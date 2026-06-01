require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const express = require('express');

// Health check server for Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ status: 'healthy', bots: startedBots.length, uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Health check server on port ${PORT}`);
});

const startedBots = [];

class KindroidBot {
  constructor(botNumber) {
    this.botNumber = botNumber;
    this.token = process.env[`BOT_${botNumber}_TOKEN`];
    this.shareCode = process.env[`BOT_${botNumber}_SHARE_CODE`];
    this.memory = new Map();
    this.client = null;
  }

  async start() {
    if (!this.token || !this.shareCode) {
      console.log(`Bot ${this.botNumber}: Missing token or share code, skipping`);
      return false;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.client.on('ready', () => {
      console.log(`Bot ${this.botNumber} online: ${this.client.user.tag}`);
      startedBots.push(this.botNumber);
      this.client.user.setPresence({
        activities: [{ name: 'Kindroid Chat', type: 3 }],
        status: 'online'
      });
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      console.log(`Bot ${this.botNumber} saw message from ${message.author.tag}: ${message.content}`);
      if (!message.mentions.has(this.client.user)) return;
      await this.handleMessage(message);
    });

    try {
      await this.client.login(this.token);
      return true;
    } catch (error) {
      console.error(`Bot ${this.botNumber} login failed:`, error.message);
      if (error.message.includes('disallowed intents')) {
        console.error(`Bot ${this.botNumber}: Enable MESSAGE CONTENT INTENT in Discord Developer Portal`);
      }
      return false;
    }
  }

  async handleMessage(message) {
    const content = message.content.replace(`<@${this.client.user.id}>`, '').trim();
    if (!content) {
      return message.reply('Hi! Mention me to chat with my Kindroid character.');
    }

    try {
      await message.channel.sendTyping();

      const historyKey = `${message.channel.id}-${message.author.id}`;
      let history = this.memory.get(historyKey) || [];
      if (!Array.isArray(history)) history = [];

      const response = await axios.post(
        'https://api.kindroid.ai/v1/share/chat',
        {
          share_code: this.shareCode,
          message: content,
          history: history.slice(-10).map(h => ({ role: h.role, content: h.content }))
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.KINDROID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      let reply = '...';
      if (typeof response.data.message === 'string') reply = response.data.message;
      else if (typeof response.data.response === 'string') reply = response.data.response;
      else if (typeof response.data === 'string') reply = response.data;
      else if (response.data) reply = JSON.stringify(response.data);

      history.push({ role: 'user', content }, { role: 'assistant', content: reply });
      if (history.length > 20) history.splice(0, 2);
      this.memory.set(historyKey, history);

      const replyStr = String(reply);
      if (replyStr.length > 2000) {
        const chunks = replyStr.match(/.{1,2000}/g) || [replyStr];
        for (const chunk of chunks) await message.reply(String(chunk));
      } else {
        await message.reply(replyStr);
      }
    } catch (error) {
      console.error(`Bot ${this.botNumber} API error:`, error.response?.data || error.message);
      if (error.response?.status === 429) {
        await message.reply('Rate limited. Please wait a moment.');
      } else {
        await message.reply('Sorry, something went wrong. Try again!');
      }
    }
  }
}

async function startAllBots() {
  console.log('Starting Kindroid Discord Bots...\n');
  if (!process.env.KINDROID_API_KEY) {
    console.error('ERROR: KINDROID_API_KEY not set');
    return;
  }

  for (let i = 1; i <= 9; i++) {
    const bot = new KindroidBot(i);
    await bot.start();
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log(`\n${startedBots.length} bots started.`);
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled error:', error);
});

startAllBots().catch(console.error);
