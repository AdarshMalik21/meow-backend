type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

type ExpoPushPayload = PushMessage & {
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
};

type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  const valid = messages.filter((m) => m.to && m.to.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  const payload: ExpoPushPayload[] = valid.map((m) => ({
    ...m,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json()) as { data?: ExpoPushTicket[]; errors?: unknown[] };

    if (!res.ok) {
      console.warn('Expo push HTTP error:', res.status, body);
      return;
    }

    for (const ticket of body.data ?? []) {
      if (ticket.status === 'error') {
        console.warn(
          'Expo push ticket error:',
          ticket.message,
          ticket.details?.error ?? ''
        );
      }
    }

    if (body.errors?.length) {
      console.warn('Expo push batch errors:', body.errors);
    }
  } catch (err) {
    console.warn('Push send failed:', err);
  }
}
