type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to && m.to.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(valid),
    });
  } catch (err) {
    console.warn('Push send failed:', err);
  }
}
