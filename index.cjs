// index.cjs - The Complete User Verification and Moderation Agent
// Features: Local Storage (LFS), Roblox API Verification, Admin Bypass, Chat Restriction, and Gemini AI Chat.
// NOTE: Channels are now distinctly configured for Verification and Gemini AI.

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

// Load Discord.js Modules
const { 
    Client, 
    GatewayIntentBits, 
    ApplicationCommandType, 
    REST, 
    Routes,
    ChannelType,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

// --- 1. Configuration Constants ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_ID_OR_USERNAME = 'Kiff1132';
const ADMIN_PASSWORD = '💀SnoWMan(09558555464($_$)';
const ADMIN_NICKNAME = 'NICE_1';

// --- CHANNEL IDS ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
// *** DEDICATED AI CHAT CHANNEL ***
const GEMINI_CHANNEL_ID = '1428272974997229589'; 
// *** DEDICATED VERIFICATION CHANNEL (Buttons/Modals/Deploy) ***
const VERIFICATION_CHANNEL_ID = '1428362219955163268'; 

// --- CRITICAL PATH CONFIGURATION (Local File System) ---
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE_PATH = path.join(DATA_DIR, 'users.json');

// --- 2. Roblox API Endpoints ---
const ROBLOX_USERNAME_TO_ID_API = "https://users.roblox.com/v1/usernames/users"; 
const ROBLOX_PROFILE_INFO_API = "https://users.roblox.com/v1/users";


// --- 3. Interaction Components & Content ---

// Shared Components
const AGREE_BUTTON_ID = 'verify_agree';
const REGISTER_BUTTON_ID = 'verify_register';
const CHANGE_PROFILE_BUTTON_ID = 'verify_change_profile'; // Informational
const USERNAME_MODAL_ID = 'modal_username_submit';
const USERNAME_INPUT_ID = 'input_roblox_username';
const PASSWORD_INPUT_ID = 'input_admin_password';

// Initial Message Content (Longer and more professional)
const TERMS_AND_POLICY = `
## 📜 Community Governance Agreement & Verification Policy

This agreement outlines the mandatory terms for full access to our community server. Compliance is required to ensure a secure, trustworthy, and high-quality environment for all members.

### I. Identity Verification Mandate (Anti-Bot & Security)
To mitigate unauthorized access, spam bots, and identity misrepresentation, all users must complete a Roblox account linkage. This is a crucial, one-time process.
* **Data Usage:** Your current Roblox username will be stored securely on the server host's Local File System (LFS) for persistent identity verification. It will also be displayed as your Discord nickname. No other personally identifiable information (PII) is collected or stored.
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
        // FIX: Removed setCustomId here to resolve the RangeError
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


// --- 4. Local File System Utility Functions (LFS) ---

async function initializeDataStore() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        try { await fs.access(DATA_FILE_PATH); } catch (error) { await fs.writeFile(DATA_FILE_PATH, '{}', 'utf8'); }
    } catch (e) {
        console.error(`❌ [LFS ERROR] Failed to initialize data store: ${e.message}`);
    }
}

async function readAllUserData() {
    try {
        const data = await fs.readFile(DATA_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) { return {}; }
}

async function saveUserData(userId, newData) {
    const allData = await readAllUserData();
    allData[userId] = { 
        ...(allData[userId] || { status: 0, robloxUsername: null, verificationKey: null, agreement: false, is_admin: false }),
        ...newData 
    };
    try {
        await fs.writeFile(DATA_FILE_PATH, JSON.stringify(allData, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ [LFS ERROR] Failed to write data for user ${userId}: ${e.message}`);
    }
}

async function getUserData(userId) {
    const allData = await readAllUserData();
    return allData[userId] || null;
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


// --- 6. New Gemini AI Function ---
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
    await initializeDataStore();
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    const clientId = client.user.id;
    
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (error) {
        console.error('❌ [COMMANDS] Failed to register application commands:', error.message);
    }
    
    console.log(`\n======================================================`);
    console.log(`✅ [CORE] Logged in as ${client.user.tag}!`);
    console.log(`✅ [MODERATION] Verification Channel: ${VERIFICATION_CHANNEL_ID}`);
    console.log(`✅ [AI] Gemini Channel: ${GEMINI_CHANNEL_ID}`);
    console.log(`======================================================\n`);
});

// --- 8. Event Handling: SLASH COMMANDS (Admin Deployment Only) ---

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'deploy_verification_message') {
            // Using flags for non-deprecated ephemeral reply
            await interaction.deferReply({ ephemeral: true });

            if (interaction.channelId !== VERIFICATION_CHANNEL_ID) {
                return interaction.editReply(`❌ This command must be run in the designated verification channel: \`${VERIFICATION_CHANNEL_ID}\``);
            }
            // Check if the user is the guild owner or a specific trusted admin if needed
            if (interaction.user.id !== interaction.guild.ownerId) { 
                 return interaction.editReply(`❌ Only the server owner can deploy this message.`);
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
    let userData = await getUserData(userId);
    if (!userData) { userData = { status: 0, robloxUsername: null, verificationKey: null, agreement: false, is_admin: false }; }

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
            await interaction.deferReply({ ephemeral: true });

            if (!userData.robloxUsername || !userData.verificationKey) {
                 await interaction.editReply("⚠️ You have not set your username. Please start the process from the beginning.");
                 return;
            }

            const currentKey = userData.verificationKey;
            const targetUsername = userData.robloxUsername;
            
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
        // 3. Change Profile Button (Informational link, handled by URL)
        // No customId logic is needed here as it's a URL button.
    }
    
    // --- B. Modal Submission Handler (Username Entry) ---
    else if (interaction.isModalSubmit()) {
        if (interaction.customId !== USERNAME_MODAL_ID) return;
        await interaction.deferReply({ ephemeral: true });

        const robloxUsername = interaction.fields.getTextInputValue(USERNAME_INPUT_ID).trim();
        const inputPassword = interaction.fields.getTextInputValue(PASSWORD_INPUT_ID);

        // --- Admin Bypass Check ---
        if (robloxUsername.toLowerCase() === ADMIN_ID_OR_USERNAME.toLowerCase() && inputPassword === ADMIN_PASSWORD) {
            await saveUserData(userId, { status: 1, robloxUsername: ADMIN_ID_OR_USERNAME, is_admin: true, agreement: true });
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
        
        await saveUserData(userId, { 
            status: 0, robloxUsername: robloxUsername, verificationKey: newKey, is_admin: false, agreement: true 
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

    const userData = await getUserData(member.id);
    const isRegistered = userData && userData.status === 1;
    
    // Check if the message is in an exempt channel
    const isExemptChannel = message.channel.id === VERIFICATION_CHANNEL_ID || message.channel.id === GEMINI_CHANNEL_ID;


    // --- A. Gemini AI Chat Logic (Runs ONLY in the dedicated AI channel) ---
    if (message.channel.id === GEMINI_CHANNEL_ID) {
        
        const prompt = message.content.trim();
        // Ignore commands or empty messages
        if (prompt.startsWith('/') || prompt.length === 0) return;

        // 1. Check Verification Status (Applies to AI channel as well)
        if (!isRegistered) {
            // Logged error suggests permission issue on delete. Keep logging but emphasize permis

       try { await message.delete(); } catch (error) { console.error(`[RESTRICTION] Could not delete message from unverified user: ${member.user.tag}. Check bot's 'Manage Messages' permission in ${message.channel.name}.`); }
            return; 
        }

        // 2. Delete original user message instantly for privacy (as requested)
        try {
            await message.delete();
        } catch (error) {
            // Log the permission issue if deletion fails
            console.error(`[GEMINI PRIVACY] Failed to delete user message: ${error.message}. Please verify the bot has 'Manage Messages' permission in the AI channel.`);
            // Continue execution even if deletion fails, but privacy is compromised
        }
        
        // 3. Bot sends the initial "Log" message (Username + Question + Thinking status)
        const robloxUsername = userData.robloxUsername || member.displayName;
        const logMessage = await message.channel.send(`**${robloxUsername}:** ${prompt} *(Thinking...)*`);
        
        await message.channel.sendTyping();
        
        // 4. Call AI
        const responseText = await generateGeminiResponse(prompt);
        
        // 5. Edit the "Log" message to include the final AI response (The final private record)
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
