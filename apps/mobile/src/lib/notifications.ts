import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { local } from './db';
import { loadAnimals } from '../domain/animals';
import { addDays, computeReminders, loadHealth } from '../domain/health';
import { reminderText } from '../domain/reminder-text';
import { today } from './format';
import i18n from './i18n';

const CHANNEL = 'reminders';
let ready: Promise<boolean> | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Ask once for permission; reminders still show inside the app if the user says no. */
function prepare(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.HIGH });
        }
        const cur = await Notifications.getPermissionsAsync();
        if (cur.granted) return true;
        return (await Notifications.requestPermissionsAsync()).granted;
      } catch {
        return false;
      }
    })();
  }
  return ready;
}

/** 08:00 Pakistan time (UTC+5) on a farm date. */
function eightAm(date: string) {
  return new Date(`${date}T03:00:00Z`);
}

/**
 * Local notifications only (no internet or paid service): one per due date for the
 * next 30 days, listing that day's reminders. Rebuilt whenever records change.
 */
export async function scheduleReminderNotifications() {
  if (Platform.OS === 'web' || !(await prepare())) return;
  try {
    const repo = local().repo;
    const [animals, h] = await Promise.all([loadAnimals(repo), loadHealth(repo)]);
    const due = computeReminders(animals, { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings }, today());
    const tags = new Map(animals.map((a) => [a.animal.id, a.animal.tag]));
    const tagOf = (id: string) => tags.get(id);
    const byDay = new Map<string, string[]>();
    const end = addDays(today(), 30);
    for (const r of due) {
      const day = r.dueDate < today() ? today() : r.dueDate; // overdue ones are shown today
      if (day > end) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), reminderText(r, tagOf)]);
    }
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = Date.now();
    for (const [day, lines] of byDay) {
      let when = eightAm(day);
      if (when.getTime() <= now) {
        if (day !== today()) continue;
        when = new Date(now + 60_000); // today's 8 am has passed: remind in a minute
      }
      await Notifications.scheduleNotificationAsync({
        content: { title: i18n.t('notificationTitle'), body: lines.slice(0, 6).join('\n') + (lines.length > 6 ? '\n…' : '') },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  } catch (e) {
    console.warn('Could not schedule reminders', e);
  }
}
