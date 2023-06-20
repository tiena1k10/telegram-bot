const { MongoClient, ObjectID } = require('mongodb');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv-safe');
const path = require('path');
const moment = require('moment-timezone');
const { groupBy, keyBy } = require('lodash');
dotenv.config({
    path: path.join(__dirname, '../.env'),
    sample: path.join(__dirname, '../.env.example'),
});
const token = process.env.TELEGRAM_OPERATION_BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB;

const client = new MongoClient(MONGO_URI, {
    useUnifiedTopology: true,
    // loggerLevel: 'debug',
});

client.connect().then(async () => {

    console.log('✅ Connected successfully to server');

    const db = client.db(MONGO_DB);
    const kings = await db.collection('kings').find({}).toArray()
    const kingsName = kings.map((king) => king.name);
    const kingKingsName = keyBy(kings, 'name');

    // ENUM zone //
    const PayStatus = {
        PENDING: 0,
        PAID: 1,
    };

    // FUNCTION zone //

    const pay = async (name, amount) => {
        const now = new Date();
        const pay = await db.collection('pays').insertOne({
            name,
            king_id: new ObjectID(kingKingsName[name]._id),
            amount,
            paid_status: PayStatus.PENDING,
            created_at: now,
            updated_at: now,
            paid_at: null,
        });
        if (pay) {
            return `✅ Vua chúa ***${name}*** pay ***${amount}k*** thành công!`;
        } else {
            return `❌ Vua chúa ***${name}*** pay ***${amount}k*** thất bại!`;
        }
    };

    const listunpaid = async () => {
        const pays = await db.collection('pays').find({ paid_status: PayStatus.PENDING }).toArray();
        const resp = pays
            .map(
                (pay) =>
                    `***${pay.name}*** pay ***${pay.amount}k*** at ${moment(pay.created_at).format(
                        'HH:mm DD/MM/YYYY',
                    )}`,
            )
            .join('\n');
        if (resp === '') {
            return '✅ Các vua chúa hết nợ nhau rồi!';
        }
        const groupedPays = groupBy(pays, 'name');
        const totalByKing = Object.keys(groupedPays).map((key) => {
            const pays = groupedPays[key];
            const total = pays.reduce((acc, pay) => acc + pay.amount, 0);
            return { name: key, total };
        });
        return `${resp}\n⭐⭐ Tổng theo vua chúa ⭐⭐:\n${totalByKing.map((king) => `***${king.name}***: ***${king.total}k***`).join('\n')}`;
    };

    // LISTEN HANDELER zone //

    const bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/pay(@[\w]*)* ([\w]+) (\d+)k/, async (msg, match) => {
        const chatId = msg.chat.id;
        const opts = {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown',
        };
        const name = match[match.length - 2];
        if (!kingsName.includes(name)) {
            const resp = `❌ Bé ***${name}*** không có trong danh sách vua chúa!`;
            bot.sendMessage(chatId, resp, opts);
            return;
        }
        const amount = parseInt(match[match.length - 1], 10);

        const resp = await pay(name, amount);

        bot.sendMessage(chatId, resp, opts);
    });

    bot.onText(/\/listunpaid(@[\w]*)*$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const opts = {
            reply_to_message_id: msg.message_id,
            parse_mode: 'markdown',
        };
        const resp = await listunpaid();
        bot.sendMessage(chatId, resp, opts);
    });
});
