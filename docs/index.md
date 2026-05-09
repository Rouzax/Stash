<div class="hero" markdown>

# Stash

<p class="tagline">The neon-lit candy drawer your family actually wants to use.</p>

<a class="cta" href="installation/">Get Started</a>

</div>

Stash is a self-hosted snack and candy tracker for families. Everyone in the house shares one inventory. Each person gets their own login, their own Rush-O-Meter, and their own consumption charts. When supplies run low, the app tells you before the drawer is empty.

<div class="features" markdown>

<div class="feature-card" markdown>
<div class="icon">🍫</div>

### Shared Family Stash

One inventory per family. Any family member can add, take, or restock items. Counts update in real time - no refreshing.
</div>

<div class="feature-card" markdown>
<div class="icon">⚡</div>

### Rush-O-Meter

A rolling consumption meter that spikes when you take things and decays on its own. Watch the mascot climb from 😴 to 🤪.
</div>

<div class="feature-card" markdown>
<div class="icon">🎛️</div>

### Per-Item Rush Config

Set a rush factor and decay window on each item. A strong coffee can hit twice as hard as a piece of candy, and wear off in half the time.
</div>

<div class="feature-card" markdown>
<div class="icon">📊</div>

### Charts

7-day and 12-month bar charts of rush units consumed, per person. Toggle between WEEK and YEAR views at the bottom of the page.
</div>

<div class="feature-card" markdown>
<div class="icon">🔔</div>

### Low-Stock Alerts

Set a threshold on any item. The card pulses neon-pink when the count drops to or below that threshold.
</div>

<div class="feature-card" markdown>
<div class="icon">🔑</div>

### Invite Codes

No open registration. Family admins generate member invite codes to add people to their family. The superadmin can also generate family starter codes to let someone set up a brand-new family. Codes are time-limited and can be single-use or multi-use.
</div>

</div>

## Quick start

```bash
mkdir stash && cd stash

# Generate a session secret
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env

# Download the production compose file
curl -sSL https://raw.githubusercontent.com/Rouzax/Stash/main/docker-compose.prod.yml \
  -o docker-compose.prod.yml

# Start
docker compose -f docker-compose.prod.yml up -d
```

Open `http://your-host:3000` and follow the setup wizard to create your family and admin account.

See the [Installation guide](installation/) for the full walkthrough.
