import webPush from 'web-push';
webPush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VALID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

export default async function handler(req, res) {
  const { subscription, title, body } = req.body;
  await webPush.sendNotification(JSON.parse(subscription), JSON.stringify({ title, body }));
  res.status(200).json({ success: true });
}
