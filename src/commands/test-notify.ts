import { sendMacNotification } from '../notifier/macos.js';

export async function runTestNotifyCommand(): Promise<void> {
  await sendMacNotification({
    title: '[aing-notify] Test',
    body: 'Notification pipeline is working'
  });
}
