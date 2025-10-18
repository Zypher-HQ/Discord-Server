// 
// --- COMPREHENSIVE DISCORD BOT CORE (v2.6 - Live Dashboard API Ready) ---
// 
// Updates in this version:
// 1. **Filename:** Renamed from index2.cjs to index.cjs.
// 2. **Dashboard API:** Imports the Express 'app' instance and 'getLogList' 
//    from keep_alive.js to host the live '/api/status' endpoint.
// 3. **Logging:** Preserves and integrates your advanced logToConsole function
//    while routing the output for dashboard capture.
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

// --- Keep Alive Web Dashboard (Importing Express app) ---
// This assumes keep_alive.js exports the Express 'app' instance and a log list getter
const { app, getLogList } = require("./keep_alive.js"); 
const path = require("path");

// --- Log File Capture (Enhanced Structured Logging) ---
const fs = require("fs");
const logFile = path.join(__dirname, "bot.log");

// Custom logging function for better traceability and structured output
function logToConsole(level, source, message, metadata = {}) {
    // Check if console._log exists before using it (set in keep_alive.js)
    const primaryLogger = typeof console._log === 'function' ? console._log : console.log;

    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp: timestamp,
        level: level.toUpperCase(),
        source: source,
        message: message,
        ...metadata 
    };
    
    // Line format for file/simple console output, ensuring it's parsable by keep_alive.js
    const metadataString = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    const logLine = `[${timestamp}][${level.toUpperCase().padEnd(8)}] [${source.padEnd(12)}] ${message}${metadataString}\n`;
    fs.appendFileSync(logFile, logLine);
    
    // Send the structured log to the console for keep_alive.js to capture and for stdout
    primaryLogger(logLine.trim()); 
}

// Override console.log for structured logging (if not already done in keep_alive.js)
if (!console._log) { 
    // Fallback in case keep_alive.js hasn't run yet
    console._log = console.log;
}
// Override the public-facing console methods to use our structured logger
console.log = (message) => logToConsole('INFO', 'GENERAL', message);
console.error = (message, metadata = {}) => logToConsole('ERROR', 'SYSTEM', message, metadata);
console.warn = (message, metadata = {}) => logToConsole('WARN', 'SYSTEM', message, metadata);


// Log initial setup
logToConsole('INFO', 'CORE', 'Starting bot process and redirecting console output.');
const botStartTime = Date.now();


// --- 1. Configuration Constants (Enhanced) ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_BOT_TOKEN';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@host:port/db';
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || 'YOUR_ROBLOX_VERIFICATION_KEY';
const GUILD_ID = process.env.GUILD_ID || '123456789012345678'; 
const CLIENT_ID = process.env.CLIENT_ID || '876543210987654321'; 

// Channel IDs
const VERIFICATION_CHANNEL_ID = '111111111111111111';
const LOG_CHANNEL_ID = '222222222222222222';
const GENERAL_CHANNEL_ID = '333333333333333333';

// Role IDs
const MEMBER_ROLE_ID = '444444444444444444'; 
const UNVERIFIED_ROLE_ID = '555555555555555555'; 

// Other Constants
const ROBLOX_GROUP_ID = 1234567; 
const ROBLOX_API_BASE = 'https://users.roblox.com/v1/users/';

console.log("Configuration Loaded. Environment Check Complete.");
console.log(`Debug Info: CLIENT_ID=${CLIENT_ID}, GUILD_ID=${GUILD_ID}`); // Added for debugging


// --- 2. Database Connection and Schema Management ---
const dbPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } 
});

// Function to ensure the necessary table exists
async function ensureDbSchema() {
    logToConsole('INFO', 'DB', "Attempting to connect to database and ensure schema...");
    const client = await dbPool.connect();
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS users (
                "discord_id" VARCHAR(20) PRIMARY KEY,
                "roblox_id" VARCHAR(20) UNIQUE NOT NULL,
                "roblox_username" VARCHAR(100) NOT NULL,
                "verification_timestamp" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                "is_group_member" BOOLEAN DEFAULT FALSE
            );
        `;
        await client.query(query);
        logToConsole('SUCCESS', 'DB', "Database schema confirmed: 'users' table is ready.");
    } catch (error) {
        logToConsole('CRITICAL', 'DB', "CRITICAL DB SCHEMA ERROR", { error: error.message });
        process.exit(1); 
    } finally {
        client.release();
    }
}

// Data Access Layer (DAL) Functions - (Keeping your existing DAL structure)
const DAL = {
    // Retrieves a user's verification status
    get: async (discord_id) => {
        try {
            const res = await dbPool.query('SELECT * FROM users WHERE "discord_id" = $1', [discord_id]);
            return res.rows[0]; 
        } catch (error) {
            logToConsole('ERROR', 'DAL', "DAL_GET_ERROR", { discord_id, error: error.message });
            return null;
        }
    },
    // Saves a new verified user
    save: async (discord_id, roblox_id, roblox_username, is_group_member) => {
        try {
            const query = `
                INSERT INTO users ("discord_id", "roblox_id", "roblox_username", "is_group_member")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("discord_id") DO UPDATE 
                SET "roblox_id" = $2, "roblox_username" = $3, "is_group_member" = $4, "verification_timestamp" = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            const res = await dbPool.query(query, [discord_id, roblox_id, roblox_username, is_group_member]);
            logToConsole('INFO', 'DAL', `User ${discord_id} saved/updated in DB.`);
            return res.rows[0];
        } catch (error) {
            logToConsole('ERROR', 'DAL', "DAL_SAVE_ERROR", { discord_id, roblox_id, error: error.message });
            return null;
        }
    },
    // Retrieves all verified users for the periodic check
    getAllVerified: async () => {
        try {
            const res = await dbPool.query('SELECT "discord_id", "roblox_id" FROM users WHERE "is_group_member" = TRUE');
            return res.rows;
        } catch (error) {
            logToConsole('ERROR', 'DAL', "DAL_GET_ALL_ERROR", { error: error.message });
            return [];
        }
    },
    // Deletes a user (e.g., for un-verification)
    delete: async (discord_id) => {
        try {
            const res = await dbPool.query('DELETE FROM users WHERE "discord_id" = $1 RETURNING *', [discord_id]);
            return res.rows[0];
        } catch (error) {
            logToConsole('ERROR', 'DAL', "DAL_DELETE_ERROR", { discord_id, error: error.message });
            return null;
        }
    }
};

// --- 3. Discord Client Initialization ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// A temporary global map to track users waiting for the Roblox API response
const PENDING_VERIFICATIONS = new Map(); 


// --- 4. Dashboard API Endpoint (LIVE DATA SOURCE) ---

if (app) {
    // This endpoint provides real-time metrics and logs to the frontend
    app.get('/api/status', (req, res) => {
        // Calculate Uptime (in seconds)
        const uptimeSeconds = client.isReady() ? Math.floor((Date.now() - botStartTime) / 1000) : 0;

        // Get DB Memory usage (approximation using Node.js Resident Set Size)
        const processMemoryMB = process.memoryUsage().rss / (1024 * 1024); 

        // Get Discord Latency (Ping)
        const latency = client.ws.ping || 0; 
        
        // Simplified DB connection check: assume connected if bot is ready and pool is connected
        const dbStatus = client.isReady() ? 'CONNECTED' : 'UNKNOWN';

        const metrics = {
            is_online: client.isReady(),
            db_status: dbStatus,
            uptime: uptimeSeconds,
            process_memory: processMemoryMB,
            latency: latency
        };

        // Get logs from the in-memory list
        const logs = getLogList ? getLogList() : [];
        
        res.json({
            metrics,
            logs: logs
        });
        logToConsole('DEBUG', 'DASHBOARD', 'Served real-time API status data.');
    });
    
    // Serve dashboard.html from the root path
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    });
} else {
    logToConsole('WARN', 'CORE', 'Express app not available for API endpoints. Dashboard will not function.');
}


// --- 5. Roblox API Helpers (Preserved from your original file) ---
async function checkRobloxMembership(robloxId) {
    logToConsole('INFO', 'ROBLOX_API', `Simulating Roblox group check for ID: ${robloxId}`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500)); 

    // Simulate response: Even IDs are members, Odd IDs are not members
    const isMember = (parseInt(robloxId) % 2) === 0; 
    
    const userData = {
        robloxId: robloxId,
        username: isMember ? `VerifiedUser_${robloxId}` : `UnverifiedGuest_${robloxId}`,
        isMember: isMember,
        group: ROBLOX_GROUP_ID
    };

    if (isMember) {
        logToConsole('SUCCESS', 'ROBLOX_API', 'Membership Confirmed.', { robloxId });
    } else {
        logToConsole('FAIL', 'ROBLOX_API', 'User not a member of the required group.', { robloxId });
    }
    
    return userData;
}

// --- 6. Application Command Registration and Event Handlers (Preserved from your original file) ---
const commands = [
    {
        name: 'verify',
        description: 'Starts the Roblox verification process.',
        type: ApplicationCommandType.ChatInput,
    },
    {
        name: 'unverify',
        description: 'Removes your verification status and roles.',
        type: ApplicationCommandType.ChatInput,
    },
    {
        name: 'checkstatus',
        description: 'Admin command: Check a user\'s verification status.',
        type: ApplicationCommandType.ChatInput,
        options: [
            {
                name: 'user',
                type: 6, // USER type
                description: 'The Discord user to check.',
                required: true,
            },
        ],
        default_member_permissions: PermissionsBitField.Flags.ManageRoles.toString(), 
    }
];

client.on('ready', async () => {
    logToConsole('SUCCESS', 'BOT', `✅ Bot is online! Logged in as ${client.user.tag}`);

    // Register slash commands globally 
    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        logToConsole('SUCCESS', 'COMMANDS', '✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        logToConsole('ERROR', 'COMMANDS', '❌ Failed to register commands', { error: error.message, details: error.rawError?.message || 'N/A' }); 
    }
    
    // Start the periodic status check
    startStatusScheduler();
});

// --- Command Handling (Original logic preserved) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const discordId = interaction.user.id;
    const member = interaction.member;

    try {
        switch (commandName) {
            case 'verify':
                const existingUser = await DAL.get(discordId);
                if (existingUser) {
                    await interaction.reply({ 
                        content: `You are already verified as **${existingUser.roblox_username}**!`, 
                        ephemeral: true 
                    });
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId('verificationModal')
                    .setTitle('Roblox Verification');

                const robloxIdInput = new TextInputBuilder()
                    .setCustomId('robloxIdInput')
                    .setLabel('Your Roblox User ID (e.g., 12345678)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(5)
                    .setPlaceholder('Must be a valid numeric Roblox User ID.');

                const firstActionRow = new ActionRowBuilder().addComponents(robloxIdInput);
                modal.addComponents(firstActionRow);

                await interaction.showModal(modal);
                PENDING_VERIFICATIONS.set(discordId, true);
                logToConsole('INFO', 'VERIFY', `Verification process started for user ${discordId}.`);
                break;

            case 'unverify':
                const deletedUser = await DAL.delete(discordId);

                if (deletedUser) {
                    await member.roles.remove(MEMBER_ROLE_ID).catch(e => logToConsole('WARN', 'ROLE', "ROLE_REMOVE_FAIL", { role: MEMBER_ROLE_ID, e: e.message }));
                    await member.roles.add(UNVERIFIED_ROLE_ID).catch(e => logToConsole('WARN', 'ROLE', "ROLE_ADD_FAIL", { role: UNVERIFIED_ROLE_ID, e: e.message }));

                    await interaction.reply({ 
                        content: `✅ Your verification for Roblox user **${deletedUser.roblox_username}** has been removed. You are now unverified.`, 
                        ephemeral: true 
                    });
                } else {
                     await interaction.reply({ 
                        content: `You are not currently verified.`, 
                        ephemeral: true 
                    });
                }
                break;
            
            case 'checkstatus':
                const targetUser = interaction.options.getUser('user');
                const userData = await DAL.get(targetUser.id);

                let statusMessage;
                if (userData) {
                    statusMessage = `User **${targetUser.tag}** is verified as **${userData.roblox_username}** (ID: ${userData.roblox_id}).\nGroup Member: **${userData.is_group_member ? 'Yes' : 'No'}**.\nVerified on: ${new Date(userData.verification_timestamp).toLocaleString()}.`;
                } else {
                    statusMessage = `User **${targetUser.tag}** is NOT currently verified in the database.`;
                }
                
                await interaction.reply({ content: statusMessage, ephemeral: true });
                break;
        }
    } catch (error) {
        logToConsole('ERROR', 'COMMANDS', `COMMAND_ERROR: /${commandName} failed for ${member.user.tag}`, { error: error.message, user: discordId });
        await interaction.reply({ content: `An unexpected error occurred while processing the /${commandName} command.`, ephemeral: true }).catch(() => {});
    }
});

// --- Modal Submission Handling (Original logic preserved) ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'verificationModal') {
        const discordId = interaction.user.id;
        const member = interaction.member;

        if (!PENDING_VERIFICATIONS.has(discordId)) {
             return await interaction.reply({ content: "Verification session expired. Please run `/verify` again.", ephemeral: true });
        }
        
        await interaction.deferReply({ ephemeral: true });

        const robloxId = interaction.fields.getTextInputValue('robloxIdInput').trim();

        if (!/^\d+$/.test(robloxId)) {
            PENDING_VERIFICATIONS.delete(discordId);
            return await interaction.editReply("❌ Error: Roblox ID must be a valid number.");
        }

        try {
            // Simulated Roblox check
            const robloxData = await checkRobloxMembership(robloxId);
            
            if (robloxData && robloxData.isMember) {
                await DAL.save(discordId, robloxData.robloxId, robloxData.username, true);

                const guild = interaction.guild;
                if (guild) {
                    await member.roles.add(MEMBER_ROLE_ID).catch(e => logToConsole('WARN', 'ROLE', "ROLE_ADD_FAIL", { role: MEMBER_ROLE_ID, e: e.message }));
                    await member.roles.remove(UNVERIFIED_ROLE_ID).catch(e => logToConsole('WARN', 'ROLE', "ROLE_REMOVE_FAIL", { role: UNVERIFIED_ROLE_ID, e: e.message }));
                }

                await interaction.editReply({ 
                    content: `🎉 Verification Successful! Welcome, **${robloxData.username}**! You now have the verified role.`
                });
                logToConsole('SUCCESS', 'VERIFICATION', 'User successfully verified.', { discordId, robloxId: robloxData.robloxId, robloxUsername: robloxData.username });

            } else {
                await interaction.editReply({ 
                    content: `⚠️ Verification Failed. Your Roblox account (**${robloxData.username}**) is not a member of the required group ID **${ROBLOX_GROUP_ID}**.`
                });
            }

        } catch (error) {
            logToConsole('ERROR', 'MODAL', 'MODAL_SUBMIT_ERROR', { error: error.message, robloxId });
            await interaction.editReply("An internal error occurred during verification. Please try again later.");
        } finally {
            PENDING_VERIFICATIONS.delete(discordId); 
        }
    }
});

// --- Periodic Status Checker (Original logic preserved) ---
function startStatusScheduler() {
    const INTERVAL_MS = 12 * 3600 * 1000; 

    const checkJob = async () => {
        logToConsole('INFO', 'SCHEDULER', '--- STARTING PERIODIC STATUS CHECK JOB ---');
        const users = await DAL.getAllVerified();
        let usersToRevoke = [];

        for (const user of users) {
            const robloxData = await checkRobloxMembership(user.roblox_id); 
            
            if (!robloxData.isMember) {
                usersToRevoke.push(user);
                logToConsole('ALERT', 'SCHEDULER', `Revocation needed for ${user.discord_id}. No longer a group member.`);
            }
        }
        
        await Promise.all(usersToRevoke.map(async (user) => {
            try {
                const guild = client.guilds.cache.get(GUILD_ID);
                const member = await guild?.members.fetch(user.discord_id).catch(() => null);

                if (member) {
                    await member.roles.remove(MEMBER_ROLE_ID).catch(e => logToConsole('WARN', 'REVOKE', "REVOKE_ROLE_FAIL", { user: user.discord_id, e: e.message }));
                    await member.roles.add(UNVERIFIED_ROLE_ID).catch(e => logToConsole('WARN', 'REVOKE', "REVOKE_ROLE_FAIL", { user: user.discord_id, e: e.message }));
                    
                    await member.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⚠️ Verification Revoked')
                                .setDescription(`Your verification status has been revoked because you are no longer a member of the required Roblox group (ID: ${ROBLOX_GROUP_ID}). Please rejoin and use \`/verify\` again.`)
                                .setColor(0xffa500)
                        ]
                    }).catch(e => logToConsole('WARN', 'REVOKE', 'Could not DM user about revocation.', { user: user.discord_id, e: e.message }));
                    
                    await dbPool.query('UPDATE users SET "is_group_member" = FALSE WHERE "discord_id" = $1', [user.discord_id]);
                    logToConsole('SUCCESS', 'REVOKE', `Successfully revoked roles and marked user non-member.`, { user: user.discord_id });
                } else {
                    logToConsole('INFO', 'REVOKE', `User ${user.discord_id} not found in guild, marking as non-member.`);
                    await dbPool.query('UPDATE users SET "is_group_member" = FALSE WHERE "discord_id" = $1', [user.discord_id]);
                }
            } catch (error) {
                logToConsole('ERROR', 'REVOKE', 'REVOCATION_PROCESS_ERROR', { user: user.discord_id, error: error.message });
            }
        }));

        logToConsole('INFO', 'SCHEDULER', `--- FINISHED PERIODIC STATUS CHECK JOB. Revoked ${usersToRevoke.length} users. ---`);
    };

    checkJob(); 
    setInterval(checkJob, INTERVAL_MS); 
    logToConsole('INFO', 'SCHEDULER', `Scheduled verification check to run every ${INTERVAL_MS / 3600000} hours.`);
}

// --- Message Restriction System (Original logic preserved) ---
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return; 
    if (message.channel.id === VERIFICATION_CHANNEL_ID) return;

    const member = message.member;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return; 

    const isRegistered = member.roles.cache.has(MEMBER_ROLE_ID); 
    if (isRegistered) return;

    if (message.channel.id === GENERAL_CHANNEL_ID) {
        try {
            await message.delete();
            
            const registerButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('📝 Go to Registration')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/${message.guild.id}/${VERIFICATION_CHANNEL_ID}`)
            );
            
            const warningMsg = await message.channel.send({
                content: `${member}, [ERROR] - Register First...`,
                components: [registerButton]
            });
            
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


// --- 7. Final Bot Startup ---
ensureDbSchema().then(() => {
    client.login(DISCORD_TOKEN)
        .catch(err => {
            logToConsole('CRITICAL', 'CORE', "❌ [CRITICAL] Failed to log into Discord! Check DISCORD_TOKEN and network connection.", { code: 'AUTH_FAILED', details: err.message });
            process.exit(1);
        });
});

