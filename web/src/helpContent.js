export const helpTopics = [
  {
    id: 'taking',
    title: 'TAKING ITEMS',
    emoji: '🫳',
    minRole: 'member',
    content: [
      { type: 'p', text: 'Each item card has buttons to consume or restock.' },
      { type: 'bullets', items: [
        'TAKE removes one full portion',
        '±¼ removes a quarter portion',
        'GIVE opens a dialog to give items away (no rush impact)',
        'Long-press TAKE to remove ten at once',
        '+ adds stock (long-press for ten)',
        'If a request fails, the count snaps back automatically',
      ]},
    ]
  },
  {
    id: 'adding',
    title: 'ADDING & EDITING ITEMS',
    emoji: '✨',
    minRole: 'member',
    content: [
      { type: 'p', text: 'Tap the + button in the header to add an item. Tap the pencil icon on a card to edit.' },
      { type: 'bullets', items: [
        'Name, emoji, and neon color set how the card looks',
        'Unit: pcs, mg, g, or ml',
        'Portion size: how much one TAKE removes',
        'Low-stock threshold: the card pulses when count drops to this level (0 = off)',
        'Rush %, Decay, and Onset control how the item affects your Rush-O-Meter',
      ]},
      { type: 'tip', text: 'Deleting an item removes it from the grid but keeps your consumption history intact.' },
    ]
  },
  {
    id: 'rush',
    title: 'RUSH-O-METER',
    emoji: '⚡',
    minRole: 'member',
    content: [
      { type: 'p', text: 'The meter in the header tracks how much you have consumed recently. It fills up when you take items and drains over time based on each item\'s decay setting.' },
      { type: 'bullets', items: [
        'Rush % on an item scales its contribution (200% = counts double)',
        'Decay sets how long until the contribution fades to zero',
        'Onset adds a delay before the contribution kicks in',
        'Tap the meter to reveal a reset button (clears the meter without deleting history)',
      ]},
      { type: 'p', text: 'Mascot moods:' },
      { type: 'bullets', items: [
        '😴 CHILL (0-25%)',
        '🙂 WARMING UP (25-50%)',
        '😄 HYPED (50-75%)',
        '🤪 FULL RAVE (75-150%)',
        '🤯 OVERDRIVE (150-250%)',
        '💀 COMA (250%+)',
      ]},
    ]
  },
  {
    id: 'charts',
    title: 'CHARTS & HISTORY',
    emoji: '📊',
    minRole: 'member',
    content: [
      { type: 'p', text: 'The bar chart below the item grid shows your personal consumption over time.' },
      { type: 'bullets', items: [
        'Toggle between WEEK (7 days) and YEAR (12 months)',
        'Tap the pencil icon next to the chart title to edit history',
        'You can add entries you forgot, fix amounts/timestamps, or delete mistakes',
        'Changes update your chart and rush meter immediately',
      ]},
      { type: 'tip', text: 'Clear all chart history from Profile settings under RUSH METER. This permanently deletes your log entries.' },
    ]
  },
  {
    id: 'alerts',
    title: 'LOW-STOCK ALERTS',
    emoji: '🚨',
    minRole: 'member',
    content: [
      { type: 'p', text: 'When an item drops to or below its threshold, the card pulses with a neon-pink glow.' },
      { type: 'bullets', items: [
        'Set the threshold in the item edit form',
        'Set to 0 to disable for that item',
        'If email notifications are on, opted-in members get an alert (max once per item every 6 hours)',
      ]},
    ]
  },
  {
    id: 'profile',
    title: 'PROFILE & NOTIFICATIONS',
    emoji: '👤',
    minRole: 'member',
    content: [
      { type: 'p', text: 'Tap your name pill (top right) or go to menu > PROFILE to edit your settings.' },
      { type: 'bullets', items: [
        'Emoji: your avatar shown in the header',
        'Color: the neon accent for your account',
        'Email: required for notifications and password reset',
        'Show exact dates: full dates instead of "2h ago"',
        'Synthwave background: toggle the animated grid and stars',
      ]},
      { type: 'p', text: 'Available notifications (requires SMTP on the server + email on your account):' },
      { type: 'bullets', items: [
        'Low stock alerts: when an item hits threshold',
        'Weekly digest: Monday summary with per-user consumption breakdown',
        'Rush meter warnings: when your meter crosses 80%',
      ]},
    ]
  },
  {
    id: 'invites',
    title: 'INVITING MEMBERS',
    emoji: '🎟️',
    minRole: 'admin',
    content: [
      { type: 'p', text: 'Invite people to join your family by generating invite codes.' },
      { type: 'bullets', items: [
        'Go to FAMILY > Users tab > expand Invite Codes section',
        'Tap Generate Invite, pick max uses (1, 5, or unlimited) and expiry (1h, 24h, 7d)',
        'Share the code with your family member',
        'They enter the code on the join screen and tap CONTINUE, then fill in a username and password',
        'Revoke a code early by tapping the trash icon',
      ]},
      { type: 'tip', text: 'Invite codes are case-insensitive. The app automatically shows the right fields based on the code type.' },
    ]
  },
  {
    id: 'admin',
    title: 'ADMIN PANEL',
    emoji: '🛡️',
    minRole: 'admin',
    content: [
      { type: 'p', text: 'Open menu > FAMILY to access the admin area. It has four tabs:' },
      { type: 'bullets', items: [
        'USERS: view members, promote/demote admins, reset passwords, delete accounts, create users directly',
        'SETTINGS: rename your family',
        'ACTIVITY: chronological feed of all family consumption and restocking, filterable by user or item',
        'SYSTEM: superadmin only (see below)',
      ]},
      { type: 'tip', text: 'You cannot delete your own account or remove the last admin from a family.' },
    ]
  },
  {
    id: 'system',
    title: 'SYSTEM MANAGEMENT',
    emoji: '🌐',
    minRole: 'superadmin',
    content: [
      { type: 'p', text: 'The System tab (admin panel) lets the superadmin manage the entire instance across all families.' },
      { type: 'bullets', items: [
        'Global user list: all users across all families, with admin/superadmin toggles',
        'Family overview: see every family with member and item counts',
        'Family starter codes: generate codes that let someone create a brand-new family',
        'Delete families: removes all users, items, and history in that family',
      ]},
      { type: 'tip', text: 'Family starter codes are the only way to create new families. Recipients enter the code and click CONTINUE, then fill in a family name and their credentials to bootstrap their own household.' },
    ]
  },
];
