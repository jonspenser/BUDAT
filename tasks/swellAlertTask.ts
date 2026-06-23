import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkAndNotify } from '../hooks/useSwellAlerts';
import { SwellRecord } from '../hooks/useSwellLog';

const TASK_NAME = 'SWELL_ALERT_CHECK';

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const raw = await AsyncStorage.getItem('@budat/swell_log');
    if (!raw) return BackgroundFetch.BackgroundFetchResult.NoData;
    const records: SwellRecord[] = JSON.parse(raw);
    const enabled = records.filter(r => r.alertEnabled && r.offshoreFingerprint?.length);
    if (!enabled.length) return BackgroundFetch.BackgroundFetchResult.NoData;
    await checkAndNotify(enabled);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerSwellAlertTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 60 * 30,
        stopOnTerminate: false,
        startOnBoot: false,
      });
    }
  } catch {}
}
