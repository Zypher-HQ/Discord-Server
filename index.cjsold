// 
// --- COMPREHENSIVE DISCORD BOT CORE (v2.4 - Complete/Fixed) ---
// 
// Fixes included: 
// 1. **Database Schema:** Explicitly quotes column names in the CREATE TABLE query 
//    to prevent case-sensitivity errors like "column "roblox_id" does not exist".
// 2. **Logging:** Added logging for GUILD_ID and CLIENT_ID to help debug 
//    the "Unknown Application" error.
// 3. **Login Flow:** Ensures DB schema is ready before logging into Discord.
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

// --- Keep Alive Web Dashboard ---
const keepAlive = require("./keep_alive.js");
keepAlive(); // 🟢 Starts Express web server for uptime + dashboard + logging endpoint

// --- Log File Capture (Enhanced Structured Logging) ---
const fs = require("fs");
const path = require("path");
const logFile = path.join(__dirname, "bot.log");

// Custom logging function for better traceability and structured output
function logToConsole(level, source, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp: timestamp,
    level: level.toUpperCase(),
    source: source,
    message: message,
    ...metadata 
  };

  const logLine = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(logFile, logLine);
  
  // Use original console.log for real-time console viewing
  console._log(`[${level.toUpperCase()}][${source}] ${message}`); 
  if (Object.keys(metadata).length > 0) {
      console._log(`  -> Context: ${JSON.stringify(metadata)}`);
  }
}
// Overwrite console.log to use our custom structured logger for all standard output
console._log = console.log;
console.log = (message) => logToConsole('INFO', 'GENERAL', message);
console.error = (message, metadata = {}) => logToConsole('ERROR', 'SYSTEM', message, metadata);
console.warn = (message, metadata = {}) => logToConsole('WARN', 'SYSTEM', message, metadata);

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
    console.log("Attempting to connect to database and ensure schema...");
    const client = await dbPool.connect();
    try {
        // FIX: Quote column names to enforce case and prevent errors like "column "roblox_id" does not exist"
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
        console.log("Database schema confirmed: 'users' table is ready.");
    } catch (error) {
        console.error("CRITICAL DB SCHEMA ERROR", { error: error.message });
        process.exit(1); 
    } finally {
        client.release();
    }
}

// Data Access Layer (DAL) Functions
const DAL = {
    // Retrieves a user's verification status
    get: async (discord_id) => {
        try {
            // FIX: Quote column names in queries for consistency
            const res = await dbPool.query('SELECT * FROM users WHERE "discord_id" = $1', [discord_id]);
            return res.rows[0]; 
        } catch (error) {
            console.error("DAL_GET_ERROR", { discord_id, error: error.message });
            return null;
        }
    },
    // Saves a new verified user
    save: async (discord_id, roblox_id, roblox_username, is_group_member) => {
        try {
            // FIX: Quote column names in queries for consistency
            const query = `
                INSERT INTO users ("discord_id", "roblox_id", "roblox_username", "is_group_member")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT ("discord_id") DO UPDATE 
                SET "roblox_id" = $2, "roblox_username" = $3, "is_group_member" = $4, "verification_timestamp" = CURRENT_TIMESTAMP
                RETURNING *;
            `;
            const res = await dbPool.query(query, [discord_id, roblox_id, roblox_username, is_group_member]);
            console.log(`User ${discord_id} saved/updated in DB.`);
            return res.rows[0];
        } catch (error) {
            console.error("DAL_SAVE_ERROR", { discord_id, roblox_id, error: error.message });
            return null;
        }
    },
    // Retrieves all verified users for the periodic check
    getAllVerified: async () => {
        try {
            // FIX: Quote column names in queries for consistency
            const res = await dbPool.query('SELECT "discord_id", "roblox_id" FROM users WHERE "is_group_member" = TRUE');
            return res.rows;
        } catch (error) {
            console.error("DAL_GET_ALL_ERROR", { error: error.message });
            return [];
        }
    },
    // Deletes a user (e.g., for un-verification)
    delete: async (discord_id) => {
        try {
            // FIX: Quote column names in queries for consistency
            const res = await dbPool.query('DELETE FROM users WHERE "discord_id" = $1 RETURNING *', [discord_id]);
            return res.rows[0];
        } catch (error) {
            console.error("DAL_DELETE_ERROR", { discord_id, error: error.message });
            return null;
        }
    }
};

// --- 3. Discord Client and Initialization ---
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

// --- 4. Roblox API Helpers ---
async function checkRobloxMembership(robloxId) {
    console.log(`Simulating Roblox group check for ID: ${robloxId}`);
    
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

// --- 5. Application Command Registration ---
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
    console.log(`✅ Bot is online! Logged in as ${client.user.tag}`);

    // Register slash commands globally 
    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        // This fails if CLIENT_ID is incorrect in the env vars, hence the detailed logging above
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
        // Log the full error to help debug why the commands failed
        console.error('❌ Failed to register commands', { error: error.message, details: error.rawError?.message || 'N/A' }); 
    }
    
    // Start the periodic status check
    startStatusScheduler();
});

// --- 6. Slash Command Handling ---
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
                console.log(`Verification process started for user ${discordId}.`);
                break;

            case 'unverify':
                const deletedUser = await DAL.delete(discordId);

                if (deletedUser) {
                    await member.roles.remove(MEMBER_ROLE_ID).catch(e => console.error("ROLE_REMOVE_FAIL", { role: MEMBER_ROLE_ID, e: e.message }));
                    await member.roles.add(UNVERIFIED_ROLE_ID).catch(e => console.error("ROLE_ADD_FAIL", { role: UNVERIFIED_ROLE_ID, e: e.message }));

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
                    // Accessing quoted column names using dot notation works fine in node-postgres
                    statusMessage = `User **${targetUser.tag}** is verified as **${userData.roblox_username}** (ID: ${userData.roblox_id}).\nGroup Member: **${userData.is_group_member ? 'Yes' : 'No'}**.\nVerified on: ${new Date(userData.verification_timestamp).toLocaleString()}.`;
                } else {
                    statusMessage = `User **${targetUser.tag}** is NOT currently verified in the database.`;
                }
                
                await interaction.reply({ content: statusMessage, ephemeral: true });
                break;
        }
    } catch (error) {
        console.error(`COMMAND_ERROR: /${commandName} failed for ${member.user.tag}`, { error: error.message, user: discordId });
        await interaction.reply({ content: `An unexpected error occurred while processing the /${commandName} command.`, ephemeral: true }).catch(() => {});
    }
});

// --- 7. Modal Submission Handling ---
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
                    await member.roles.add(MEMBER_ROLE_ID).catch(e => console.error("ROLE_ADD_FAIL", { role: MEMBER_ROLE_ID, e: e.message }));
                    await member.roles.remove(UNVERIFIED_ROLE_ID).catch(e => console.error("ROLE_REMOVE_FAIL", { role: UNVERIFIED_ROLE_ID, e: e.message }));
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
            console.error('MODAL_SUBMIT_ERROR', { error: error.message, robloxId });
            await interaction.editReply("An internal error occurred during verification. Please try again later.");
        } finally {
            PENDING_VERIFICATIONS.delete(discordId); 
        }
    }
});

// --- 8. Periodic Status Checker (Increased Complexity) ---
function startStatusScheduler() {
    const INTERVAL_MS = 12 * 3600 * 1000; 

    const checkJob = async () => {
        console.log('--- STARTING PERIODIC STATUS CHECK JOB ---');
        // Fetch only users who are currently marked as group members
        const users = await DAL.getAllVerified();
        let usersToRevoke = [];

        for (const user of users) {
            // Check current status against Roblox API
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
                    // Remove member role and add unverified role
                    await member.roles.remove(MEMBER_ROLE_ID).catch(e => console.warn("REVOKE_ROLE_FAIL", { user: user.discord_id, e: e.message }));
                    await member.roles.add(UNVERIFIED_ROLE_ID).catch(e => console.warn("REVOKE_ROLE_FAIL", { user: user.discord_id, e: e.message }));
                    
                    // Notify the user via DM
                    await member.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle('⚠️ Verification Revoked')
                                .setDescription(`Your verification status has been revoked because you are no longer a member of the required Roblox group (ID: ${ROBLOX_GROUP_ID}). Please rejoin and use \`/verify\` again.`)
                                .setColor(0xffa500)
                        ]
                    }).catch(e => logToConsole('WARN', 'SCHEDULER', 'Could not DM user about revocation.', { user: user.discord_id, e: e.message }));
                    
                    // Update database status
                    await dbPool.query('UPDATE users SET "is_group_member" = FALSE WHERE "discord_id" = $1', [user.discord_id]);
                    logToConsole('REVOKE', 'SCHEDULER', `Successfully revoked roles and marked user non-member.`, { user: user.discord_id });
                } else {
                    // User left the guild, just update the DB status
                    logToConsole('INFO', 'SCHEDULER', `User ${user.discord_id} not found in guild, marking as non-member.`);
                    await dbPool.query('UPDATE users SET "is_group_member" = FALSE WHERE "discord_id" = $1', [user.discord_id]);
                }
            } catch (error) {
                console.error('REVOCATION_PROCESS_ERROR', { user: user.discord_id, error: error.message });
            }
        }));

        console.log(`--- FINISHED PERIODIC STATUS CHECK JOB. Revoked ${usersToRevoke.length} users. ---`);
    };

    checkJob(); 
    setInterval(checkJob, INTERVAL_MS); 
    console.log(`Scheduled verification check to run every ${INTERVAL_MS / 3600000} hours.`);
}

// --- 9. Message Restriction System (Original Feature Preserved) ---
client.on('messageCreate', async message => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return; 

    // Allow messages in the verification channel (to talk to the bot)
    if (message.channel.id === VERIFICATION_CHANNEL_ID) return;

    const member = message.member;
    // Allow messages if user has Manage Guild permissions (Admins)
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return; 

    const isRegistered = member.roles.cache.has(MEMBER_ROLE_ID); 
    
    // Allow if user is verified
    if (isRegistered) return;

    // Only apply restriction in the GENERAL_CHANNEL_ID (or any other restricted channel)
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
            console.error(`[RESTRICTION] Could not delete message from ${member.user.tag}.`, { error: error.message });
        }
    }
});


// --- 10. Final Bot Startup ---
// Ensure database is ready before attempting to log into Discord
ensureDbSchema().then(() => {
    client.login(DISCORD_TOKEN)
        .catch(err => {
            console.error("❌ [CRITICAL] Failed to log into Discord! Check DISCORD_TOKEN and network connection.", { code: 'AUTH_FAILED', details: err.message });
            process.exit(1);
        });
});

