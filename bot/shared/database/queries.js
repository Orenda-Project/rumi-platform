/**
 * Database Queries for Admin Dashboard
 * Provides analytics and data retrieval functions
 */

const supabase = require('../config/supabase');

/**
 * Get total number of users (chats started)
 */
async function getTotalUsers() {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count || 0;
}

/**
 * Get total voice notes received (from users)
 */
async function getTotalVoiceNotesReceived() {
  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'user')
    .eq('message_type', 'voice');

  if (error) throw error;
  return count || 0;
}

/**
 * Get total voice notes sent (by bot)
 */
async function getTotalVoiceNotesSent() {
  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'assistant')
    .eq('message_type', 'voice');

  if (error) throw error;
  return count || 0;
}

/**
 * Get total messages exchanged
 */
async function getTotalMessages() {
  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return count || 0;
}

/**
 * Get Daily Active Users (users who sent messages in last 24 hours)
 */
async function getDailyActiveUsers() {
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const { data, error } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('role', 'user')
    .gte('created_at', oneDayAgo.toISOString());

  if (error) throw error;

  // Count unique user_ids
  const uniqueUsers = new Set(data.map(row => row.user_id));
  return uniqueUsers.size;
}

/**
 * Get Weekly Active Users (users who sent messages in last 7 days)
 */
async function getWeeklyActiveUsers() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('role', 'user')
    .gte('created_at', sevenDaysAgo.toISOString());

  if (error) throw error;

  // Count unique user_ids
  const uniqueUsers = new Set(data.map(row => row.user_id));
  return uniqueUsers.size;
}

/**
 * Get all users with basic info
 */
async function getAllUsers(limit = 100, offset = 0) {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone_number, name, registration_completed, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * Get conversation history for a specific user
 */
async function getUserConversations(userId, limit = 50) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, role, content, message_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Get user details by ID
 */
async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get recent activity (last 10 conversations across all users)
 */
async function getRecentActivity(limit = 10) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      role,
      content,
      message_type,
      created_at,
      user_id,
      users (phone_number, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Get dashboard stats summary
 */
async function getDashboardStats() {
  const [
    totalUsers,
    totalMessages,
    voiceNotesReceived,
    voiceNotesSent,
    dau,
    wau
  ] = await Promise.all([
    getTotalUsers(),
    getTotalMessages(),
    getTotalVoiceNotesReceived(),
    getTotalVoiceNotesSent(),
    getDailyActiveUsers(),
    getWeeklyActiveUsers()
  ]);

  return {
    totalUsers,
    totalMessages,
    voiceNotesReceived,
    voiceNotesSent,
    dailyActiveUsers: dau,
    weeklyActiveUsers: wau
  };
}

module.exports = {
  getTotalUsers,
  getTotalVoiceNotesReceived,
  getTotalVoiceNotesSent,
  getTotalMessages,
  getDailyActiveUsers,
  getWeeklyActiveUsers,
  getAllUsers,
  getUserConversations,
  getUserById,
  getRecentActivity,
  getDashboardStats
};
