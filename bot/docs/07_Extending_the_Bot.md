# Extending the Bot

Guide to adding new features and integrations to the Rumi.

---

## Adding New Features

### Example: Add Image Analysis (GPT-4 Vision)

**Goal**: Teachers send classroom photos, bot provides teaching suggestions.

**Requirements**:
- OpenAI Vision API (GPT-4 Vision)
- WhatsApp image message handling
- Image download and processing

**Implementation**:

#### 1. Handle Image Messages

```javascript
// In POST /webhook handler, whatsapp-bot.js

if (messageType === 'image') {
  const imageId = messages[0].image.id;
  const caption = messages[0].image.caption || '';
  await handleImageMessage(userId, imageId, caption, messageId);
}
```

#### 2. Download Image

```javascript
async function downloadWhatsAppImage(imageId) {
  // Get media URL
  const mediaUrlResponse = await axios.get(
    `https://graph.facebook.com/v21.0/${imageId}`,
    {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
    }
  );

  // Download image
  const imageResponse = await axios.get(
    mediaUrlResponse.data.url,
    {
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
      responseType: 'arraybuffer'
    }
  );

  return Buffer.from(imageResponse.data);
}
```

#### 3. Analyze with GPT-4 Vision

```javascript
async function analyzeImage(imageBuffer, caption) {
  const base64Image = imageBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this classroom image and provide teaching suggestions.
                 Focus on: classroom setup, student engagement, teaching materials.
                 Caption: ${caption}`
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`
          }
        }
      ]
    }],
    max_tokens: 500
  });

  return response.choices[0].message.content;
}
```

#### 4. Send Response

```javascript
async function handleImageMessage(userId, imageId, caption, messageId) {
  try {
    logToFile('Processing image message', { userId, imageId });

    const imageBuffer = await downloadWhatsAppImage(imageId);
    const analysis = await analyzeImage(imageBuffer, caption);

    await sendWhatsAppMessage(userId, analysis);
    await markAsRead(messageId);

    logToFile('Image analysis sent', { userId });
  } catch (error) {
    logToFile('Error analyzing image', { error: error.message });
    await sendWhatsAppMessage(userId, "Sorry, I couldn't analyze that image. Please try again.");
  }
}
```

**Cost Impact**: ~$0.01-0.05 per image (GPT-4 Vision pricing).

**Estimated Effort**: 3-4 hours.

---

### Example: Add Persistent Conversation Storage (Redis)

**Goal**: Preserve conversation history across server restarts.

**Requirements**:
- Redis Cloud account (free tier available)
- `ioredis` npm package

**Implementation**:

#### 1. Install Redis Client

```bash
npm install ioredis
```

#### 2. Configure Redis

```javascript
// At top of whatsapp-bot.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  logToFile('Redis connected');
});

redis.on('error', (err) => {
  logToFile('Redis error', { error: err.message });
});
```

#### 3. Store Conversation

```javascript
async function saveConversation(userId, messages) {
  try {
    await redis.set(
      `conversation:${userId}`,
      JSON.stringify(messages),
      'EX',
      86400  // Expire after 24 hours
    );
    logToFile('Conversation saved', { userId });
  } catch (error) {
    logToFile('Error saving conversation', { error: error.message });
  }
}
```

#### 4. Retrieve Conversation

```javascript
async function getConversation(userId) {
  try {
    const data = await redis.get(`conversation:${userId}`);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    logToFile('Error retrieving conversation', { error: error.message });
    return [];
  }
}
```

#### 5. Update Message Handler

```javascript
// Replace in-memory storage
// OLD:
// const conversationHistories = {};

// NEW: In handleTextMessage function
const history = await getConversation(userId);
history.push({ role: 'user', content: messageBody });

const completion = await openai.chat.completions.create({
  model: "gpt-4",
  messages: history
});

const responseText = completion.choices[0].message.content;
history.push({ role: 'assistant', content: responseText });

await saveConversation(userId, history);
```

#### 6. Add Environment Variable

```env
# .env
REDIS_URL=redis://default:password@redis-host:6379
```

**Benefits**:
- Conversations persist across restarts
- Can implement conversation analytics
- Can add admin dashboard to view conversations
- Can implement conversation export

**Cost**: Free tier (30MB storage) sufficient for ~1,000 users.

**Estimated Effort**: 4-6 hours.

---

### Example: Add Admin Commands

**Goal**: Special commands for administrators to manage the bot.

**Implementation**:

#### 1. Define Admin Users

```javascript
const ADMIN_USERS = [
  '923001234567',  // Haroon's number
  '923009876543'   // Other admin
];

function isAdmin(userId) {
  return ADMIN_USERS.includes(userId);
}
```

#### 2. Parse Commands

```javascript
function parseCommand(message) {
  if (!message.startsWith('/')) return null;

  const [command, ...args] = message.slice(1).split(' ');
  return { command, args };
}
```

#### 3. Handle Admin Commands

```javascript
async function handleAdminCommand(userId, command, args) {
  switch (command) {
    case 'stats':
      // Return usage statistics
      const stats = {
        totalMessages: processedMessageIds.size,
        activeUsers: Object.keys(conversationHistories).length,
        uptime: process.uptime()
      };
      return `📊 Stats:\nMessages: ${stats.totalMessages}\nUsers: ${stats.activeUsers}\nUptime: ${Math.floor(stats.uptime/3600)}h`;

    case 'clear':
      // Clear specific user's conversation
      const targetUser = args[0];
      delete conversationHistories[targetUser];
      return `✅ Cleared conversation for ${targetUser}`;

    case 'broadcast':
      // Send message to all users
      const message = args.join(' ');
      const users = Object.keys(conversationHistories);
      for (const user of users) {
        await sendWhatsAppMessage(user, message);
      }
      return `✅ Broadcasted to ${users.length} users`;

    case 'health':
      // Check API service health
      const health = await checkAPIHealth();
      return `🏥 Health:\n${JSON.stringify(health, null, 2)}`;

    default:
      return `❌ Unknown command: ${command}\n\nAvailable:\n/stats\n/clear <user>\n/broadcast <message>\n/health`;
  }
}
```

#### 4. Integrate in Message Handler

```javascript
// In handleTextMessage function
if (messageBody.startsWith('/')) {
  if (!isAdmin(userId)) {
    await sendWhatsAppMessage(userId, "⛔ Sorry, you don't have admin access.");
    return;
  }

  const { command, args } = parseCommand(messageBody);
  const response = await handleAdminCommand(userId, command, args);
  await sendWhatsAppMessage(userId, response);
  return; // Don't process as regular message
}
```

**Example Admin Commands**:
- `/stats` - Get usage statistics
- `/clear 923001234567` - Clear user's conversation
- `/broadcast Important update: ...` - Send to all users
- `/logs 50` - Get last 50 log entries
- `/health` - Check API service health

**Estimated Effort**: 2-3 hours.

---

## Integration Opportunities

### Google Classroom Integration

**Use Case**: Sync lesson plans to teacher's Google Classroom.

**Requirements**:
- Google Classroom API
- OAuth 2.0 authentication
- Teacher account linking

**Workflow**:
1. Teacher links Google account (one-time OAuth flow)
2. After generating lesson plan, bot asks: "Post to Google Classroom?"
3. Teacher confirms via button/message
4. Bot creates assignment with PDF attachment

**Estimated Effort**: 12-16 hours (OAuth setup, API integration).

---

### SMS Fallback (Twilio)

**Use Case**: Support teachers without WhatsApp.

**Requirements**:
- Twilio account
- Phone number for SMS
- Webhook handling for SMS

**Implementation**: Similar to WhatsApp webhook, but simpler (text-only).

**Cost**: ~$0.01-0.05 per message (outbound).

**Estimated Effort**: 6-8 hours.

---

### Analytics Dashboard

**Use Case**: Track usage metrics for product improvement.

**Requirements**:
- Database (PostgreSQL or MongoDB)
- Dashboard framework (React + Chart.js)
- API endpoints for metrics

**Metrics to Track**:
- Messages per day
- Voice vs text ratio
- Lesson plan requests
- Error rate
- Average response time
- Top user queries (anonymized)

**Stack**: Next.js + Recharts + Tailwind CSS

**Estimated Effort**: 20-30 hours.

---

## Feature Request Template

When planning new features, document:

```markdown
## Feature: [Name]

### Goal
What problem does this solve?

### User Story
As a [user type], I want [feature] so that [benefit].

### Requirements
- Technical requirements
- API dependencies
- New packages needed

### Implementation Plan
1. Step 1
2. Step 2
...

### Cost Impact
- API costs
- Hosting costs
- Development time

### Success Metrics
How will we measure success?

### Estimated Effort
X hours
```

---

## Code Contribution Guidelines

### Before Submitting a Pull Request

1. **Test Locally**:
   ```bash
   npm install
   npm start
   # Test thoroughly
   ```

2. **Run Linter** (if configured):
   ```bash
   npm run lint
   ```

3. **Update Documentation**:
   - Add to this file if it's a new feature
   - Update [01_Overview_and_Features.md](01_Overview_and_Features.md) for user-facing changes
   - Update [06_Known_Issues.md](06_Known_Issues.md) for bug fixes

4. **Write Commit Message**:
   ```
   feat: Add image analysis with GPT-4 Vision

   - Handle WhatsApp image messages
   - Download and encode images
   - Analyze with GPT-4 Vision API
   - Return teaching suggestions

   Closes #42
   ```

5. **Create Pull Request**:
   - Reference issue number
   - Describe changes clearly
   - Include screenshots if UI changes

---

## Testing New Features

### Unit Testing (Future)

Consider adding Jest for unit tests:

```bash
npm install --save-dev jest
```

```javascript
// whatsapp-bot.test.js
test('parseCommand extracts command and args', () => {
  const result = parseCommand('/stats user 123');
  expect(result.command).toBe('stats');
  expect(result.args).toEqual(['user', '123']);
});
```

### Integration Testing

Test end-to-end flows:

```bash
# Simulate webhook
npm run simulate

# Send test message
npm run send

# Local chat
npm run chat
```

---

**Complete**: You've now explored all documentation files. Return to [Skill.md](Skill.md) for navigation.
