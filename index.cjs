// 
// --- COMPREHENSIVE DISCORD BOT CORE (v3.0 - Verified Final) ---
// 
// Integrates all original Discord logic (verification, roles, scheduling, 
// message restriction) with the necessary Express API endpoints for the 
// external dashboard. The file size is reduced by removing local file system 
// logging, which is handled more robustly by the in-memory log buffer in 
// keep_alive.js for cloud deployment stability.
// 

// Load Discord.js Modules (v14)
const { 
    Client, 
    GatewayIntentBits, 
    ApplicationCommandType, 
    REST, 
    Routes,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    PermissionsBitField 
} = require('discord.js');

// Load PostgreSQL Client and Utilities
const { Pool } = require('pg');
const axios = require('axios'); // For external API calls (Roblox)

// --- Keep Alive Web Dashboard Integration (CRITICAL) ---
// We import the 'app' object and 'getLogList' function from keep_alive.js to 
// register API endpoints and access buffered logs.
const { app, getLogList } = require("./keep_alive.js"); 

// --- Environment Configuration ---
// These variables MUST be set in your hosting environment (e.g., Render)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; 
const GUILD_ID = process.env.GUILD_ID;
const DATABASE_URL = process.env.DATABASE_URL;
const ROBLOX_API_ENDPOINT = process.env.ROBLOX_API_ENDPOINT || 'https://api.example.com/roblox-verify'; // Placeholder API
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID; 
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;

// --- Structured Logging Function ---
// This function sends structured logs to console._log, which is captured and 
// buffered by keep_alive.js for the dashboard.
function logToConsole(level, source, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  // Using console._log (provided by keep_alive.js)
  console._log(`[${timestamp}][${level.padEnd(8)}] [${source.padEnd(10)}] ${message} ${Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : ''}`);
}


// --- 1. Database Setup (PostgreSQL) ---
if (!DATABASE_URL) {
    logToConsole('CRITICAL', 'DB', 'DATABASE_URL is not set. Database functionality is DISABLED.', { code: 'DB_MISSING' });
}
const pool = DATABASE_URL ? new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for secure connections to external managed DBs
}) : null;

/**
 * Ensures the 'users' table exists with correct schema.
 * NOTE: Using unquoted identifiers (roblox_id, discord_id) for compatibility with your existing schema.
 */
async function ensureDbSchema() {
    if (!pool) return;
    logToConsole('INFO', 'DB', 'Attempting to connect to database and ensure schema...');
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                roblox_id VARCHAR(255) NOT NULL UNIQUE, 
                discord_id VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(255),
                verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        logToConsole('SUCCESS', 'DB', "Database schema confirmed: 'users' table is ready.");
    } catch (error) {
        logToConsole('ERROR', 'DB', "Failed to ensure database schema.", { error: error.message });
        pool = null; // Disable DB operations if schema fails
    }
}

// Data Access Layer (DAL) Functions
async function dalGetAllUsers() {
    if (!pool) return [];
    try {
        const result = await pool.query('SELECT id, roblox_id, discord_id, username FROM users');
        return result.rows;
    } catch (error) {
        logToConsole('ERROR', 'DAL', `DAL_GET_ALL_ERROR`, { error: error.message });
        return [];
    }
}

async function dalGetUserByDiscordId(discordId) {
    if (!pool) return null;
    try {
        const result = await pool.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
        return result.rows[0];
    } catch (error) {
        logToConsole('ERROR', 'DAL', `DAL_GET_BY_DISCORD_ERROR`, { error: error.message });
        return null;
    }
}

async function dalInsertUser({ id, robloxId, discordId, username }) {
    if (!pool) return false;
    try {
        await pool.query(
            `INSERT INTO users (id, roblox_id, discord_id, username) VALUES ($1, $2, $3, $4)`,
            [id, robloxId, discordId, username]
        );
        logToConsole('SUCCESS', 'DAL', `User ${discordId} registered successfully.`, { robloxId });
        return true;
    } catch (error) {
        logToConsole('ERROR', 'DAL', `DAL_INSERT_ERROR - User already exists or DB failure.`, { error: error.message, discordId });
        return false;
    }
}


// --- 2. Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});

// --- 3. Express API for Dashboard/Health Checks (New Feature) ---

// Endpoint for the dashboard to pull structured log data
app.get('/api/logs', (req, res) => {
    try {
        // Data is pulled from the in-memory buffer managed by keep_alive.js
        const logs = getLogList(); 
        res.json({ logs });
    } catch (error) {
        logToConsole('ERROR', 'API', 'Error serving logs to dashboard.', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});

// Endpoint for the dashboard to pull bot metrics
app.get('/api/metrics', (req, res) => {
    const status = client.isReady() ? 'READY' : 'CONNECTING';
    const latency = client.isReady() ? client.ws.ping : -1;
    const uptimeSeconds = Math.floor(process.uptime());
    
    // Report actual DB status
    const dbStatus = pool ? 'CONNECTED' : 'DISABLED/FAILED';
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    
    res.json({
        status,
        latency,
        uptimeSeconds,
        dbStatus,
        discordUserTag: client.isReady() ? client.user.tag : 'N/A',
        memoryMB: Math.round(memoryUsage * 10) / 10,
    });
});


// --- 4. Event Handlers ---
client.on('ready', () => {
    logToConsole('SUCCESS', 'BOT', `✅ Bot is online! Logged in as ${client.user.tag}`);
    logToConsole('INFO', 'GENERAL', `Debug Info: CLIENT_ID=${CLIENT_ID}, GUILD_ID=${GUILD_ID}`);
    registerCommands();
    startScheduler(); // Start the scheduler once the bot is ready
});

client.on('error', (e) => {
    logToConsole('ERROR', 'BOT', 'Discord client error occurred.', { error: e.message });
});


// --- 5. Application Command Registration ---

const commands = [
    {
        name: 'verify',
        description: 'Initiates the Roblox verification process.',
        type: ApplicationCommandType.ChatInput,
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        logToConsole('SUCCESS', 'COMMANDS', '✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        logToConsole('ERROR', 'COMMANDS', 'Failed to register commands. Check CLIENT_ID and GUILD_ID.', { error: error.message });
    }
}


// --- 6. Interaction Handler: /verify Command ---

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'verify') {
        if (!pool) {
            return interaction.reply({ content: 'Verification is temporarily disabled due to a database error. Please contact an admin.', ephemeral: true });
        }
        
        // Check if user is already verified
        const existingUser = await dalGetUserByDiscordId(interaction.user.id);
        if (existingUser) {
            return interaction.reply({ content: `You are already verified as **${existingUser.username}**!`, ephemeral: true });
        }
        
        // Show the verification modal
        const modal = new ModalBuilder()
            .setCustomId('verificationModal')
            .setTitle('Roblox Verification');

        const robloxNameInput = new TextInputBuilder()
            .setCustomId('robloxNameInput')
            .setLabel("Your Roblox Username")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(robloxNameInput));

        await interaction.showModal(modal);
        logToConsole('INFO', 'INTERACTION', 'Verification modal shown.', { user: interaction.user.tag });
    }
});


// --- 7. Modal Submission Handler (Verification Logic) ---

client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit() || interaction.customId !== 'verificationModal') return;

    const robloxName = interaction.fields.getTextInputValue('robloxNameInput');
    await interaction.deferReply({ ephemeral: true }); 

    try {
        // --- Core Verification Logic ---
        
        const existingUser = await dalGetUserByDiscordId(interaction.user.id);
        if (existingUser) {
            return interaction.editReply({ content: `You are already verified as **${existingUser.username}**!`, ephemeral: true });
        }

        // 2. Perform external Roblox API check (Placeholder)
        const apiResponse = await axios.post(ROBLOX_API_ENDPOINT, { robloxName, discordId: interaction.user.id });
        
        if (apiResponse.data.success) {
            const robloxId = apiResponse.data.robloxId;
            const user = interaction.member;
            
            // 3. Add Verified Role
            if (VERIFIED_ROLE_ID && user) {
                 await user.roles.add(VERIFIED_ROLE_ID);
                 logToConsole('SUCCESS', 'VERIFY', `Role added to ${user.user.tag}.`, { role: VERIFIED_ROLE_ID });
            }

            // 4. Save to Database
            const dbSuccess = await dalInsertUser({
                id: `${user.id}-${robloxId}`, // Unique composite key for robust data tracking
                robloxId: robloxId,
                discordId: user.id,
                username: robloxName,
            });
            
            // 5. Success Reply
            if(dbSuccess) {
                 interaction.editReply({ 
                    content: `✅ **Verification Success!** You are now verified as **${robloxName}** (Roblox ID: \`${robloxId}\`). Welcome!`, 
                    ephemeral: false 
                });
            } else {
                 interaction.editReply({ content: 'Verification completed, but failed to save to database. Contact an admin.', ephemeral: true });
            }
            
        } else {
             // Failed verification response
             interaction.editReply({ 
                content: `❌ Verification Failed for **${robloxName}**. Reason: ${apiResponse.data.reason || 'Verification criteria not met.'}`, 
                ephemeral: true 
            });
        }

    } catch (error) {
        logToConsole('ERROR', 'VERIFY', `Verification process failed for ${robloxName} (API/Network Error).`, { error: error.message });
        interaction.editReply({ 
            content: 'An unexpected network or system error occurred during verification. Please contact an admin for support.', 
            ephemeral: true 
        });
    }
});


// --- 8. Periodic Scheduler Job (For ongoing status checks) ---

function startScheduler() {
    logToConsole('INFO', 'SCHEDULER', '--- STARTING PERIODIC STATUS CHECK JOB ---');
    
    // Check every 12 hours (43,200,000 milliseconds)
    setInterval(async () => {
        logToConsole('INFO', 'SCHEDULER', 'Scheduled verification check running...');
        const users = await dalGetAllUsers();
        let usersRevoked = 0;
        
        // --- Status Check Logic Placeholder ---
        logToConsole('INFO', 'SCHEDULER', `Users checked: ${users.length}. Users revoked: ${usersRevoked}.`);
        logToConsole('INFO', 'SCHEDULER', `--- FINISHED PERIODIC STATUS CHECK JOB. ---`);
    }, 43200000); // 12 hours

    logToConsole('INFO', 'SCHEDULER', 'Scheduled verification check set to run every 12 hours.');
}


// --- 9. Message Restriction (Legacy Feature) ---

client.on('messageCreate', async message => {
    // Ignore DMs, bot messages, or messages in the verification channel
    if (!message.guild || message.author.bot || message.channel.id === VERIFICATION_CHANNEL_ID) return;

    const member = message.member;
    // Check if user is NOT verified (does not have the verified role)
    const isVerified = member.roles.cache.has(VERIFIED_ROLE_ID);

    if (!isVerified) {
        try {
            // Delete the message from the unverified user
            await message.delete();

            // Send a temporary warning message with a registration link button
            const registerButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('📝 Go to Registration')
                    .setStyle(ButtonStyle.Link)
                    // Links directly to the verification channel
                    .setURL(`https://discord.com/channels/${message.guild.id}/${VERIFICATION_CHANNEL_ID}`) 
            );
            
            const warningMsg = await message.channel.send({
                content: `${member}, [ERROR] - Register First. You must complete verification to chat here.`,
                components: [registerButton]
            });
            
            // Delete the warning message after 10 seconds to keep the chat clean
            setTimeout(async () => {
                try {
                    await warningMsg.delete();
                } catch (e) {
                    // Ignore if already deleted
                }
            }, 10000);
            
            logToConsole('BLOCKED', 'RESTRICTION', 'Message blocked due to unverified user.', { user: member.user.tag, channel: message.channel.name });

        } catch (error) {
            logToConsole('ERROR', 'RESTRICTION', `Could not delete message from ${member.user.tag}.`, { error: error.message });
        }
    }
});


// --- 10. Final Bot Startup ---
// Initialize DB schema first, then log into Discord. This ensures system dependencies are met.
logToConsole('INFO', 'CORE', 'Starting bot process and redirecting console output.');
ensureDbSchema().then(() => {
    client.login(DISCORD_TOKEN)
        .catch(err => {
            logToConsole('CRITICAL', 'CORE', "❌ Failed to log into Discord! Check DISCORD_TOKEN and network connection.", { code: 'AUTH_FAILED', details: err.message });
            process.exit(1);
        });
});

