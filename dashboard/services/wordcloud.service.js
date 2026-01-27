/**
 * Word Cloud Service for Conversation Analysis
 * Processes user messages and generates word frequency data
 */

const supabase = require('../config/supabase');

class WordCloudService {
  constructor() {
    // Common English stop words to filter out
    this.stopWords = new Set([
      'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your',
      'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her',
      'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs',
      'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
      'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
      'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
      'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
      'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
      'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o',
      're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn',
      'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn',
      'weren', 'won', 'wouldn', 'hi', 'hello', 'please', 'thank', 'thanks', 'yes',
      'no', 'ok', 'okay', 'u', 'ur', 'pls', 'thx'
    ]);

    // Common Urdu stop words (romanized)
    this.urduStopWords = new Set([
      'hai', 'hain', 'ho', 'tha', 'thi', 'the', 'ka', 'ki', 'ke', 'ko', 'ne',
      'se', 'mein', 'par', 'pe', 'aur', 'ya', 'lekin', 'magar', 'kya', 'kaise',
      'kab', 'kahan', 'kyun', 'kon', 'kis', 'jis', 'us', 'is', 'ye', 'wo', 'woh',
      'yeh', 'main', 'hum', 'aap', 'tum', 'ap', 'ji', 'jee', 'han'
    ]);

    // Combine stop words
    this.allStopWords = new Set([...this.stopWords, ...this.urduStopWords]);

    // Cache settings
    this.cache = null;
    this.cacheTimestamp = null;
    this.cacheDuration = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  /**
   * Get word frequency data for word cloud
   */
  async getWordFrequency(forceRefresh = false) {
    try {
      // Check cache
      if (!forceRefresh && this.cache && this.cacheTimestamp) {
        const now = Date.now();
        if (now - this.cacheTimestamp < this.cacheDuration) {
          console.log('Returning cached word frequency data');
          return { success: true, data: this.cache, cached: true };
        }
      }

      // Fetch all user messages
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('content')
        .eq('role', 'user')
        .not('content', 'is', null);

      if (error) {
        throw error;
      }

      // Process messages to extract words
      const wordFrequency = this.processMessages(conversations);

      // Convert to array format for word cloud
      const wordCloudData = Object.entries(wordFrequency)
        .map(([text, value]) => ({ text, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 100); // Top 100 words

      // Update cache
      this.cache = wordCloudData;
      this.cacheTimestamp = Date.now();

      return { success: true, data: wordCloudData, cached: false };
    } catch (error) {
      console.error('Get word frequency error:', error);
      return { success: false, error: 'Failed to get word frequency data' };
    }
  }

  /**
   * Process messages to extract word frequency
   */
  processMessages(conversations) {
    const wordFrequency = {};

    conversations.forEach(conv => {
      if (!conv.content) return;

      // Convert to lowercase and split into words
      const words = conv.content
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => {
          return word.length > 2 && // Minimum 3 characters
                 word.length < 20 && // Maximum 20 characters
                 !this.allStopWords.has(word) && // Not a stop word
                 !/^\d+$/.test(word); // Not just numbers
        });

      // Count word frequency
      words.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      });
    });

    return wordFrequency;
  }

  /**
   * Get topic trends over time
   */
  async getTopicTrends(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('content, created_at')
        .eq('role', 'user')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      // Group by date and extract top words per day
      const dailyTrends = {};

      conversations.forEach(conv => {
        const date = new Date(conv.created_at).toISOString().split('T')[0];
        if (!dailyTrends[date]) {
          dailyTrends[date] = {};
        }

        if (conv.content) {
          const words = this.extractWords(conv.content);
          words.forEach(word => {
            dailyTrends[date][word] = (dailyTrends[date][word] || 0) + 1;
          });
        }
      });

      // Get top 5 words per day
      const trends = Object.entries(dailyTrends).map(([date, words]) => {
        const topWords = Object.entries(words)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([word, count]) => ({ word, count }));

        return { date, topWords };
      });

      return { success: true, trends };
    } catch (error) {
      console.error('Get topic trends error:', error);
      return { success: false, error: 'Failed to get topic trends' };
    }
  }

  /**
   * Extract meaningful words from text
   */
  extractWords(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => {
        return word.length > 2 &&
               word.length < 20 &&
               !this.allStopWords.has(word) &&
               !/^\d+$/.test(word);
      });
  }

  /**
   * Get user engagement keywords
   */
  async getUserEngagementKeywords() {
    try {
      // Get messages that led to high engagement (longer conversations)
      const { data: sessions, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('id')
        .gt('message_count', 10) // High engagement sessions
        .limit(100);

      if (sessionError) {
        throw sessionError;
      }

      const sessionIds = sessions.map(s => s.id);

      // Get conversations from high engagement sessions
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('content')
        .eq('role', 'user')
        .in('session_id', sessionIds);

      if (error) {
        // If session_id doesn't exist, fall back to all conversations
        const { data: allConversations, error: allError } = await supabase
          .from('conversations')
          .select('content')
          .eq('role', 'user')
          .limit(1000);

        if (allError) {
          throw allError;
        }

        conversations = allConversations;
      }

      const wordFrequency = this.processMessages(conversations || []);

      const engagementKeywords = Object.entries(wordFrequency)
        .map(([text, value]) => ({ text, value, type: 'engagement' }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 20);

      return { success: true, keywords: engagementKeywords };
    } catch (error) {
      console.error('Get engagement keywords error:', error);
      return { success: false, error: 'Failed to get engagement keywords' };
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = null;
    this.cacheTimestamp = null;
    console.log('Word cloud cache cleared');
  }
}

// Create singleton instance
let wordCloudServiceInstance = null;

function getWordCloudService() {
  if (!wordCloudServiceInstance) {
    wordCloudServiceInstance = new WordCloudService();
  }
  return wordCloudServiceInstance;
}

module.exports = getWordCloudService;