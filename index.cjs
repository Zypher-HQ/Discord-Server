// index.cjs - Discord Bot with Neon.tech PostgreSQL Database Integration
// Data is now persisted using the DATABASE_URL environment variable.

require('dotenv').config();
// No more file system imports (fs, path)

// Load Discord.js Modules
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
    TextInputStyle
} = require('discord.js');

// Load PostgreSQL Client
const { Pool } = require('pg');

// --- 1. Configuration Constants ---
// NOTE: These are now loaded from the .env file.
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const DATABASE_URL = process.env.DATABASE_URL;

const ADMIN_ID_OR_USERNAME = 'Kiff1132';
const ADMIN_PASSWORD = '💀SnoWMan(09558555464($_$)';
const ADMIN_NICKNAME = 'NICE_1';

// --- ROLES & CHANNEL IDS ---
// The single Administrator role ID provided by the user
const ADMIN_ROLE_ID = '1428371944063111309'; 
const GEMINI_CHANNEL_ID = '1428272974997229589'; 
const VERIFICATION_CHANNEL_ID = '1428362219955163268'; 


// --- 2. Database Connection Pool Setup ---

let dbPool;
if (DATABASE_URL) {
    dbPool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
            // Neon requires SSL. Use rejectUnauthorized: false if needed, 
            // but true is preferred for security if using a valid certificate.
            rejectUnauthorized: false 
        }
    });
}

/** Executes a SQL query using the connection pool. */
async function dbQuery(text, params) {
    if (!dbPool) {
        console.error("❌ Database pool is not initialized.");
        return null;
    }
    try {
        const res = await dbPool.query(text, params);
        return res;
    } catch (e) {
        console.error("❌ [DB ERROR] Query failed:", e.message, "Query:", text);
        return null;
    }
}

// --- 3. Database Utility Functions (Replaces LFS) ---

/** Initializes the user data table if it doesn't exist. */
async function initializeDataStore() {
    if (!dbPool) return console.error("FATAL: Cannot initialize database. DATABASE_URL is missing.");

    const query = `
        CREATE TABLE IF NOT EXISTS users (
            discord_id VARCHAR(20) PRIMARY KEY,
            status INTEGER DEFAULT 0, -- 0: Unverified, 1: Verified
            roblox_username VARCHAR(100),
            verification_key VARCHAR(12),
            agreement BOOLEAN DEFAULT FALSE,
            is_admin BOOLEAN DEFAULT FALSE
        );
    `;
    const result = await dbQuery(query);
    if (result) console.log("✅ [DB] User data table initialized successfully.");
}

/** Retrieves user data from the database. */
async function getUserData(userId) {
    const query = 'SELECT * FROM users WHERE discord_id = $1';
    const res = await dbQuery(query, [userId]);
    
    // Return the database row or null if not found
    return res && res.rows.length > 0 ? res.rows[0] : null;
}

/** Inserts or updates user data. */
async function saveUserData(userId, newData) {
    // Merge default structure for robust upsert operation
    const currentData = await getUserData(userId) || {
        discord_id: userId,
        status: 0,
        roblox_username: null,
        verification_key: null,
        agreement: false,
        is_admin: false
    };

    const data = { ...currentData, ...newData, discord_id: userId };

    const query = `
        INSERT INTO users (discord_id, status, roblox_username, verification_key, agreement, is_admin)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (discord_id) DO UPDATE 
        SET status = $2, roblox_username = $3, verification_key = $4, agreement = $5, is_admin = $6;
    `;
    const params = [
        data.discord_id,
        data.status,
        data.roblox_username,
        data.verification_key,
        data.agreement,
        data.is_admin
    ];
    
    await dbQuery(query, params);
}


// --- 4. Roblox API Endpoints and Shared Components (Rest of the bot logic remains the same) ---

const ROBLOX_USERNAME_TO_ID_API = "https://users.roblox.com/v1/usernames/users"; 
const ROBLOX_PROFILE_INFO_API = "https://users.roblox.com/v1/users";

// Shared Components
const AGREE_BUTTON_ID = 'verify_agree';
const REGISTER_BUTTON_ID = 'verify_register';
const USERNAME_MODAL_ID = 'modal_username_submit';
const USERNAME_INPUT_ID = 'input_roblox_username';
const PASSWORD_INPUT_ID = 'input_admin_password';

// Initial Message Content (Longer and more professional)
const TERMS_AND_POLICY = `
## 📜 Community Governance Agreement & Verification Policy

This agreement outlines the mandatory terms for full access to our community server. Compliance is required to ensure a secure, trustworthy, and high-quality environment for all members.

### I. Identity Verification Mandate (Anti-Bot & Security)
To mitigate unauthorized access, spam bots, and identity misrepresentation, all users must complete a Roblox account linkage. This is a crucial, one-time process.
* **Data Usage:** Your current Roblox username will be stored securely in our **PostgreSQL database (Neon.tech)** for persistent identity verification. It will also be displayed as your Discord nickname. No other personally identifiable information (PII) is collected or stored.
* **Access Compliance:** Failure to successfully complete the verification process will result in the automatic deletion of any messages sent in general communication channels.

### II. Code of Conduct & Server Rules
By proceeding with verification, you formally agree to adhere strictly to the following community standards:
* **Respectful Interaction:** Maintain professional and courteous conduct at all times. Harassment, excessive profanity, hate speech, and discrimination are strictly prohibited.
* **Adherence to TOS:** You are bound by the Discord Terms of Service and Community Guidelines, in addition to all server-specific rules defined by the administration.

### III. Chat Functionality & Privacy Guarantee
* **Restricted Channels:** Unverified users are actively prevented from chatting in most server channels.
* **AI Chat Privacy:** In the dedicated Gemini AI channel, to maximize the privacy of your queries, your original message will be **immediately deleted** upon submission. The bot will then post a log of your question and the AI's answer, ensuring your prompt history is minimized in the public view.

**Click 'Agree' below to confirm your understanding and commence the identity verification process.**
`;

const getTermsActionRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId(AGREE_BUTTON_ID)
        .setLabel('✅ Agree to Terms & Start Verification')
        .setStyle(ButtonStyle.Success),
);

// Verification Key Message Content
const getVerificationKeyActionRow = (key) => new ActionRowBuilder().addComponents(
    new ButtonBuilder()
        .setCustomId(REGISTER_BUTTON_ID)
        .setLabel('📋 Register & Verify Profile Key')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setLabel('➡️ Instructions: Change Profile')
        .setStyle(ButtonStyle.Link) // Link buttons must use Link style
        .setURL('https://www.roblox.com/users/profile'), // Direct link to user's profile
);

const getVerificationKeyEmbed = (username, key) => ({
    color: 0x5865F2, // Discord Blurple
    title: '🔑 STEP 2: Profile Key Verification',
    description: `You must now verify that you own the Roblox account **\`${username}\`**.`,
    fields: [
        {
            name: '1. Copy Your Key:',
            value: `\`${key}\``,
            inline: false,
        },
        {
            name: '2. Update Roblox "About" Section:',
            value: 'Go to your Roblox Profile and change your **"About"** section (Description) to **ONLY** contain the key above.',
            inline: false,
        },
        {
            name: '3. Click Register:',
            value: 'Once your profile is updated, click the **"Register & Verify Profile Key"** button below.',
            inline: false,
        },
    ],
    timestamp: new Date(),
});


/** Generates a 12-character alphanumeric key. */
function generateVerificationKey() {
    return Array(12).fill(0).map(() => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
}


// --- 5. Implemented Roblox API Functions ---

async function getRobloxUserId(username) {
    try {
        const response = await fetch(ROBLOX_USERNAME_TO_ID_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
        });
        const data = await response.json();
        if (data.data && data.data.length > 0) {
            return { id: data.data[0].id, exists: true };
        } else {
            return { id: null, exists: false };
        }
    } catch (e) { return { id: null, exists: false }; }
}

async function checkRobloxUserExists(username) {
    const { exists } = await getRobloxUserId(username);
    return exists;
}

async function checkRobloxProfileKey(username, key) {
    const { id: userId, exists } = await getRobloxUserId(username);
    if (!exists) return false;

    try {
        const profileUrl = `${ROBLOX_PROFILE_INFO_API}/${userId}`;
        const response = await fetch(profileUrl);
        if (!response.ok) return false;
        
        const data = await response.json();
        const profileDescription = data.description.trim();

        return profileDescription === key;

    } catch (e) {
        return false;
    }
}


// --- 6. Gemini AI Function ---
async function generateGeminiResponse(prompt) {
    if (!GEMINI_API_KEY) return "⚠️ Gemini AI is configured but the API Key is missing in the .env file.";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const systemPrompt = "You are a helpful, witty, and slightly sarcastic Discord bot assistant. Keep your responses concise and engaging, and use Discord markdown features like bolding and emojis.";

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [{ "google_search": {} }],
    };
    
    // Simple exponential backoff retry mechanism (no logging to console)
    for (let i = 0; i < 3; i++) { 
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            return result.candidates?.[0]?.content?.parts?.[0]?.text || "🤔 Hmm, I couldn't generate a coherent response right now.";
        } catch (e) {
            if (i < 2) await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000));
        }
    }
    return "🔥 A network error occurred while reaching the Gemini API after multiple retries.";
}


// --- 7. Discord Client Setup and Initialization ---

// NEW COMMAND: To deploy the initial message
const commands = [
    {
        name: 'deploy_verification_message',
        description: 'ADMIN ONLY: Deploys the initial verification message with the Agree button.',
        type: ApplicationCommandType.ChatInput,
    }
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers, 
    ],
    partials: ['CHANNEL', 'MESSAGE'],
});


client.on('ready', async () => {
    await initializeDataStore(); // Database Initialization
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const clientId = client.user.id;
    
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (error) {
        console.error('❌ [COMMANDS] Failed to register application commands:', error.message);
    }
    
    console.log(`\n======================================================`);
    console.log(`✅ [CORE] Logged in as ${client.user.tag}!`);
    console.log(`✅ [DATA] Using Neon.tech PostgreSQL for persistence.`);
    console.log(`✅ [ADMIN] Admin Role ID Configured: ${ADMIN_ROLE_ID}`);
    console.log(`======================================================\n`);
});

// --- 8. Event Handling: SLASH COMMANDS (Admin Deployment Only) ---

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'deploy_verification_message') {
            const member = interaction.member;

            // Using flags: 64 is the InteractionResponseFlags.Ephemeral constant
            await interaction.deferReply({ flags: 64 });

            if (interaction.channelId !== VERIFICATION_CHANNEL_ID) {
                return interaction.editReply(`❌ This command must be run in the designated verification channel: \`${VERIFICATION_CHANNEL_ID}\``);
            }
            
            // --- ROLE CHECK ---
            const isAdminByRole = member.roles.cache.has(ADMIN_ROLE_ID);

            if (interaction.user.id !== interaction.guild.ownerId && !isAdminByRole) { 
                 return interaction.editReply(`❌ Only the server owner or a user with the correct Admin role (ID: \`${ADMIN_ROLE_ID}\`) can deploy this message.`);
            }

            // Deploy the persistent message
            await interaction.channel.send({
                content: TERMS_AND_POLICY,
                components: [getTermsActionRow()],
            });
            await interaction.editReply('✅ Initial verification message deployed successfully!');
            return;
        }
    }
});


// --- 9. Event Handling: MESSAGE COMPONENTS (Verification Flow) ---

client.on('interactionCreate', async interaction => {
    const userId = interaction.user.id;
    const member = interaction.member;
    // Check database for user data
    let userData = await getUserData(userId);
    // Convert to a standard object if not found, to simplify logic
    if (!userData) { userData = { status: 0, roblox_username: null, verification_key: null, agreement: false, is_admin: false }; }

    // Block interaction if already registered
    if (userData.status === 1 && interaction.customId?.startsWith('verify_')) {
        return interaction.reply({ content: "✅ You are already registered and verified!", ephemeral: true });
    }

    // --- A. Button Handlers (AGREE & REGISTER) ---
    if (interaction.isButton()) {
        if (interaction.channelId !== VERIFICATION_CHANNEL_ID) return;
        
        // 1. Agree Button Click
        if (interaction.customId === AGREE_BUTTON_ID) {
            // Show Modal for username submission (Phase 2)
            const modal = new ModalBuilder()
                .setCustomId(USERNAME_MODAL_ID)
                .setTitle('Roblox Username Submission');

            const usernameInput = new TextInputBuilder()
                .setCustomId(USERNAME_INPUT_ID)
                .setLabel("Your Roblox Username")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Kiff1132')
                .setRequired(true);

            const passwordInput = new TextInputBuilder()
                .setCustomId(PASSWORD_INPUT_ID)
                .setLabel("Admin Bypass Password (Optional)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Only fill this if logging in as Kiff1132')
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(usernameInput),
                new ActionRowBuilder().addComponents(passwordInput)
            );

            await interaction.showModal(modal);
            
        } 
        
        // 2. Register Button Click (Final API Check)
        else if (interaction.customId === REGISTER_BUTTON_ID) {
            // Using flags: 64 is the InteractionResponseFlags.Ephemeral constant
            await interaction.deferReply({ flags: 64 });

            if (!userData.roblox_username || !userData.verification_key) {
                 await interaction.editReply("⚠️ You have not set your username. Please start the process from the beginning.");
                 return;
            }

            const currentKey = userData.verification_key;
            const targetUsername = userData.roblox_username;
            
            const profileVerified = await checkRobloxProfileKey(targetUsername, currentKey);

            if (profileVerified) {
                // SUCCESS: Final access grant
                await saveUserData(userId, { status: 1, agreement: true });
                
                try {
                    if (member && member.manageable) {
                         await member.setNickname(targetUsername, "Roblox verification successful.");
                    }
                    await interaction.editReply(`🎉 **VERIFICATION COMPLETE!** Your Discord nickname is now **${targetUsername}**, and you can chat in all channels.`);
                    
                    // Optionally delete the Key message to keep the channel clean
                    if (interaction.message.deletable) await interaction.message.delete();

                } catch (e) {
                     await interaction.editReply(`🎉 **VERIFICATION COMPLETE!** You can now chat! Nickname change failed (Check bot permissions).`);
                }

            } else {
                // FAILURE
                await interaction.editReply(`
                    ❌ **VERIFICATION FAILED.** (Roblox Profile Check Failed)

                    We could not find the key in \`${targetUsername}\`'s profile description. Please **re-check** that the key \`${currentKey}\` is the **only text** in your profile and try again.
                `);
            }
        }
    }
    
    // --- B. Modal Submission Handler (Username Entry) ---
    else if (interaction.isModalSubmit()) {
        if (interaction.customId !== USERNAME_MODAL_ID) return;
        // Using flags: 64 is the InteractionResponseFlags.Ephemeral constant
        await interaction.deferReply({ flags: 64 });

        const robloxUsername = interaction.fields.getTextInputValue(USERNAME_INPUT_ID).trim();
        const inputPassword = interaction.fields.getTextInputValue(PASSWORD_INPUT_ID);

        // --- Admin Bypass Check ---
        if (robloxUsername.toLowerCase() === ADMIN_ID_OR_USERNAME.toLowerCase() && inputPassword === ADMIN_PASSWORD) {
            await saveUserData(userId, { status: 1, roblox_username: ADMIN_ID_OR_USERNAME, is_admin: true, agreement: true });
            try {
                if (member && member.manageable) {
                     await member.setNickname(ADMIN_NICKNAME, "Admin bypass login complete.");
                }
                await interaction.editReply(`🔑 **ADMIN BYPASS SUCCESS!** You are now registered, and your nickname has been set to **${ADMIN_NICKNAME}**.`);
            } catch (e) {
                await interaction.editReply(`🔑 **ADMIN BYPASS SUCCESS!** You are now registered. Nickname change failed (Check bot permissions).`);
            }
            return;
        }
        
        // --- CRITICAL API CHECK 1: User Existence ---
        const userExists = await checkRobloxUserExists(robloxUsername);
        if (!userExists) {
             await interaction.editReply(`❌ **ERROR:** The Roblox username \`${robloxUsername}\` could not be found or is invalid. Please check the spelling and try again.`);
             return;
        }
        
        // User exists, proceed with key generation (Phase 3 Start)
        const newKey = generateVerificationKey();
        
        // Save the generated key and username to the database (status remains 0/unverified)
        await saveUserData(userId, { 
            status: 0, 
            roblox_username: robloxUsername, 
            verification_key: newKey, 
            is_admin: false, 
            agreement: true 
        });
        
        // Send the Key Verification message in the channel
        await interaction.channel.send({
            content: `<@${userId}>, please complete step 2.`,
            embeds: [getVerificationKeyEmbed(robloxUsername, newKey)],
            components: [getVerificationKeyActionRow(newKey)],
        });

        await interaction.editReply(`✅ **Username \`${robloxUsername}\` set.** Please see the new message above for your **Verification Key** and the next step!`);
    }
});


// --- 10. Event Handling: MESSAGE CREATE (Restriction & Gemini Chat) ---

client.on('messageCreate', async message => {
    // Ignore DMs, bots, and messages not from a guild
    if (!message.inGuild() || message.author.bot) return;
    
    const member = message.member;
    if (!member) return; 

    // Fetch user data from DB
    const userData = await getUserData(member.id);
    const isRegistered = userData && userData.status === 1;
    
    // Check if the message is in an exempt channel
    const isExemptChannel = message.channel.id === VERIFICATION_CHANNEL_ID || message.channel.id === GEMINI_CHANNEL_ID;


    // --- A. Gemini AI Chat Logic (Runs ONLY in the dedicated AI channel) ---
    if (message.channel.id === GEMINI_CHANNEL_ID) {
        
        const prompt = message.content.trim();
        // Ignore commands or empty messages
        if (prompt.startsWith('/') || prompt.length === 0) return;

        // 1. Check Verification Status 
        if (!isRegistered) {
            try { 
                await message.delete(); 
            } catch (error) { 
                console.error(`[RESTRICTION] Could not delete message from unverified user: ${member.user.tag}. Check bot's 'Manage Messages' permission in ${message.channel.name}.`); 
            }
            return; 
        }

        // 2. Delete original user message instantly for privacy (as requested)
        try {
            await message.delete();
        } catch (error) {
            console.error(`[GEMINI PRIVACY] Failed to delete user message: Missing Permissions.`);
        }
        
        // 3. Bot sends the initial "Log" message 
        const robloxUsername = userData.roblox_username || member.displayName;
        const logMessage = await message.channel.send(`**${robloxUsername}:** ${prompt} *(Thinking...)*`);
        
        await message.channel.sendTyping();
        
        // 4. Call AI
        const responseText = await generateGeminiResponse(prompt);
        
        // 5. Edit the "Log" message to include the final AI response
        const finalContent = `**${robloxUsername}:** ${prompt}\n\n---\n\n${responseText}`;
        await logMessage.edit(finalContent);
        
        return; 
    }

    // --- B. Chat Restriction Logic (Applies to all other channels) ---
    
    // If the channel is exempt or the user is registered, do nothing.
    if (isExemptChannel || isRegistered) return;

    // If the user is NOT registered and is NOT in an exempt channel, delete their message.
    if (!isRegistered) {
        try {
            await message.delete();
        } catch (error) {
            console.error(`[RESTRICTION] Could not delete message from ${member.user.tag}.`);
        }
    }
});


// 11. Final Bot Startup
client.login(DISCORD_TOKEN)
    .catch(err => {
        console.error("❌ [CRITICAL] Failed to log into Discord! Check DISCORD_TOKEN and network connection.");
        process.exit(1);
    });
