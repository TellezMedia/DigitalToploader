<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Digital TopLoader – TCG Collection Tracker & Portfolio Value</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css">
<style>
  :root {
    --bg: #14213D;
    --card: #1B2A4D;
    --border: #2A3A5C;
    --text: #E6E8EE;
    --text-muted: #8890a6;
    --accent: #2E86FF;
    --accent-light: #39D0FF;
    --gold: #F6C453;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #signed-out-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    height: 100vh;
    padding: 0 20px;
  }
  .logo-frame {
    width: 64px;
    height: 88px;
    border: 1.5px solid var(--accent);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;
    position: relative;
  }
  .logo-frame span { font-size: 22px; font-weight: 500; color: var(--accent-light); }
  .logo-frame span.dt-t { color: var(--text); }
  .logo-frame .spark { position: absolute; top: 6px; right: 8px; color: var(--gold); font-size: 12px; }
  .wordmark { font-size: 22px; font-weight: 500; margin: 0 0 4px; }
  .wordmark .digital { color: var(--accent-light); }
  .wordmark .toploader { color: var(--text); }
  .wordmark .dotcom { color: var(--gold); }
  .tagline { font-size: 13px; color: var(--text-muted); margin: 0 0 2rem; max-width: 280px; }
  #signed-out-view button {
    background: var(--text);
    color: var(--bg);
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .divider-line {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2rem;
    opacity: 0.5;
  }
  .divider-line .line { width: 30px; height: 1px; background: var(--accent); }
  #signed-in-view { display: none; padding: 24px; }
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  .topbar button {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
  }
  .layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 20px;
  }
  .stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .stat-card p.label {
    font-size: 11px;
    color: var(--text-muted);
    margin: 0 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .stat-card p.value {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
  }
  .stat-card p.sub {
    font-size: 12px;
    color: var(--text-muted);
    margin: 4px 0 0;
  }
  .set-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .set-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px;
  }
  .set-card p.name { font-size: 14px; font-weight: 600; margin: 0 0 2px; }
  .set-card p.game { font-size: 11px; color: var(--text-muted); margin: 0 0 8px; }
  .progress-track {
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-fill { height: 100%; background: var(--accent); }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
  .empty { color: var(--text-muted); font-size: 13px; padding: 20px; text-align: center; }
  select {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
  }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .section-header h2 { margin: 0; }
  .recent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 12px;
    margin-bottom: 28px;
  }
  .recent-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
  }
  .recent-card img, .recent-card .thumb-placeholder {
    width: 100%;
    aspect-ratio: 5 / 7;
    object-fit: cover;
    border-radius: 6px;
    margin-bottom: 8px;
    background: var(--bg);
    cursor: pointer;
  }
  .recent-card .thumb-placeholder { border: 1px dashed var(--border); cursor: default; }
  .recent-card .name { font-size: 12px; font-weight: 500; margin: 0 0 2px; }
  .recent-card .meta { font-size: 11px; color: var(--text-muted); margin: 0; }
  .recent-card .price { font-size: 12px; color: var(--accent-light); font-weight: 600; margin-top: 4px; }
  #lightbox-overlay {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(10, 14, 26, 0.85);
    align-items: center;
    justify-content: center;
    z-index: 1000;
    cursor: zoom-out;
  }
  #lightbox-overlay img { max-width: 80vw; max-height: 85vh; border-radius: 8px; }
  .auth-box { width: 100%; max-width: 320px; }
  .provider-btn {
    width: 100%;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  .provider-btn.google { background: var(--text); color: var(--bg); border-color: var(--text); }
  .provider-btn.discord { background: #5865F2; color: #fff; border-color: #5865F2; }
  .provider-btn.github { background: #171717; color: #fff; border-color: #333; }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    margin: 16px 0;
  }
  .auth-divider .line { flex: 1; height: 1px; background: var(--border); }
  #email-auth-form input {
    width: 100%;
    margin-bottom: 10px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
  }
  #email-auth-form button { width: 100%; margin-bottom: 10px; justify-content: center; }
  .auth-toggle-text { font-size: 13px; color: var(--text-muted); }
  .auth-toggle-text a { color: var(--accent-light); text-decoration: none; }
  .auth-error { font-size: 12px; color: #e05a5a; min-height: 16px; }
  .add-collection-btn {
    background: linear-gradient(90deg, var(--accent), var(--accent-light));
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
  }
</style>
</head>
<body>

<div id="signed-out-view">
  <div class="logo-frame">
    <span>D<span class="dt-t">T</span></span>
    <i class="ti ti-sparkles spark" aria-hidden="true"></i>
  </div>
  <p class="wordmark"><span class="digital">Digital</span> <span class="toploader">TopLoader</span><span class="dotcom">.com</span></p>
  <p class="tagline">Track your Pokemon, Magic, and Lorcana collection value in one place.</p>
  <div class="auth-box">
    <button class="provider-btn google" onclick="signInWithGoogle()">
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.93c1.71-1.58 2.7-3.9 2.7-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.17l-2.93-2.27c-.81.55-1.85.87-3.03.87-2.33 0-4.3-1.57-5-3.68H1v2.34C2.48 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M4 10.75c-.18-.55-.29-1.13-.29-1.75s.11-1.2.29-1.75V4.91H1c-.6 1.2-.95 2.55-.95 4.09s.35 2.89.95 4.09z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.48 2.02 1 4.91l3 2.34c.7-2.11 2.67-3.68 5-3.68z"/></svg>
      Sign in with Google
    </button>
    <button class="provider-btn discord" onclick="signInWithDiscord()">
      <i class="ti ti-brand-discord" aria-hidden="true"></i> Sign in with Discord
    </button>
    <button class="provider-btn github" onclick="signInWithGithub()">
      <i class="ti ti-brand-github" aria-hidden="true"></i> Sign in with GitHub
    </button>
    <div class="auth-divider"><div class="line"></div><span>or use email</span><div class="line"></div></div>
    <div id="email-auth-form">
      <input type="email" id="auth-email" placeholder="Email">
      <input type="password" id="auth-password" placeholder="Password">
      <button id="email-auth-submit" onclick="handleEmailAuth()">Sign in</button>
      <p class="auth-toggle-text">Don't have an account? <a href="#" onclick="toggleAuthMode(event)">Sign up</a></p>
      <p class="auth-error" id="auth-error"></p>
    </div>
  </div>
  <div class="divider-line">
    <div class="line"></div>
    <i class="ti ti-cards" style="font-size:12px; color: var(--accent-light);" aria-hidden="true"></i>
    <div class="line"></div>
  </div>
</div>

<div id="signed-in-view">
  <div class="topbar">
    <div style="display: flex; align-items: center;">
      <span style="font-size: 15px; font-weight: 600; margin-right: 24px;"><span style="color: var(--accent-light);">Digital</span> <span style="color: var(--text);">TopLoader</span><span style="color: var(--gold);">.com</span></span>
      <a href="index.html" style="color: var(--accent); font-weight: 600; text-decoration: none; margin-right: 16px; font-size: 14px;">Dashboard</a>
      <a href="collection.html" style="color: var(--text-muted); text-decoration: none; margin-right: 16px; font-size: 14px;">Collection</a>
    </div>
    <div>
      <a class="add-collection-btn" href="collection.html"><i class="ti ti-plus" aria-hidden="true"></i> Add to Collection</a>
      <span id="user-email" style="color: var(--text-muted); font-size: 13px; margin: 0 12px;"></span>
      <button onclick="signOut()">Sign out</button>
    </div>
  </div>

  <div class="layout">
    <div id="stats-column">
      <div class="stat-card"><p class="label">Portfolio value</p><p class="value" id="stat-value">-</p></div>
      <div class="stat-card"><p class="label">Unique cards</p><p class="value" id="stat-unique">-</p><p class="sub" id="stat-sets-sub">-</p></div>
      <div class="stat-card"><p class="label">Total cards</p><p class="value" id="stat-total">-</p></div>
    </div>
    <div>
      <div class="section-header">
        <h2>Recently added</h2>
        <select id="recent-sort" onchange="renderRecentlyAdded()">
          <option value="date">Sort: Date added</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="value">Sort: Value</option>
        </select>
      </div>
      <div id="recent-grid" class="recent-grid"></div>

      <h2>Set completion</h2>
      <div id="set-grid" class="set-grid"></div>
    </div>
  </div>
</div>

<div id="lightbox-overlay" onclick="closeLightbox()">
  <img id="lightbox-img" src="" alt="">
</div>

<script>
  // Fill in your own values from Supabase Project Settings > Data API / API Keys
  const SUPABASE_URL = 'https://nzxnqrakcxsuqhsmxmhq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DsRnbaCvlUHWK2EaAVE7kA_ccB26f2q';
  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  async function signInWithGoogle() {
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    if (error) console.error('Sign-in error:', error);
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.reload();
  }

  async function signInWithDiscord() {
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'discord' });
    if (error) console.error('Discord sign-in error:', error);
  }

  async function signInWithGithub() {
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'github' });
    if (error) console.error('GitHub sign-in error:', error);
  }

  let authMode = 'signin';

  function toggleAuthMode(e) {
    e.preventDefault();
    authMode = authMode === 'signin' ? 'signup' : 'signin';
    document.getElementById('email-auth-submit').textContent = authMode === 'signin' ? 'Sign in' : 'Sign up';
    document.querySelector('.auth-toggle-text').innerHTML = authMode === 'signin'
      ? `Don't have an account? <a href="#" onclick="toggleAuthMode(event)">Sign up</a>`
      : `Already have an account? <a href="#" onclick="toggleAuthMode(event)">Sign in</a>`;
    document.getElementById('auth-error').textContent = '';
  }

  async function handleEmailAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    errorEl.style.color = '#e05a5a';
    errorEl.textContent = '';

    if (!email || !password) {
      errorEl.textContent = 'Enter both email and password.';
      return;
    }

    if (authMode === 'signup') {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) { errorEl.textContent = error.message; return; }
      errorEl.style.color = 'var(--accent-light)';
      errorEl.textContent = 'Check your email to confirm your account, then sign in.';
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) { errorEl.textContent = error.message; return; }
    }
  }

  function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-overlay').style.display = 'flex';
  }

  function closeLightbox() {
    document.getElementById('lightbox-overlay').style.display = 'none';
  }

  let recentCardsRaw = [];

  function renderRecentlyAdded() {
    const sortBy = document.getElementById('recent-sort').value;
    const grid = document.getElementById('recent-grid');

    if (recentCardsRaw.length === 0) {
      grid.innerHTML = '<div class="empty">No cards added yet.</div>';
      return;
    }

    let sorted = [...recentCardsRaw];
    if (sortBy === 'rarity') {
      sorted.sort((a, b) => (a.cards?.rarity || '').localeCompare(b.cards?.rarity || ''));
    } else if (sortBy === 'value') {
      sorted.sort((a, b) => {
        const priceA = a.cards?.latest_prices?.find((p) => p.variant === (a.variant || 'Normal'))?.market_price || 0;
        const priceB = b.cards?.latest_prices?.find((p) => p.variant === (b.variant || 'Normal'))?.market_price || 0;
        return priceB - priceA;
      });
    }
    // 'date' is already the default order from the query (added_at desc)

    sorted = sorted.slice(0, 10);
    grid.innerHTML = '';
    for (const row of sorted) {
      const card = row.cards;
      const priceEntry = card?.latest_prices?.find((p) => p.variant === (row.variant || 'Normal')) || card?.latest_prices?.[0];
      const price = priceEntry?.market_price;
      const el = document.createElement('div');
      el.className = 'recent-card';
      el.innerHTML = `
        ${card?.image_url
          ? `<img src="${card.image_url}" alt="" loading="lazy" onclick="openLightbox('${card.image_url}')">`
          : `<div class="thumb-placeholder"></div>`}
        <p class="name">${card?.name || ''}</p>
        <p class="meta">${card?.sets?.name || ''}${card?.rarity ? ' · ' + card.rarity : ''}</p>
        ${price ? `<p class="price">$${Number(price).toFixed(2)}</p>` : ''}
      `;
      grid.appendChild(el);
    }
  }

  let loadedUserId = null;

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session) {
      document.getElementById('signed-out-view').style.display = 'none';
      document.getElementById('signed-in-view').style.display = 'block';
      document.getElementById('user-email').textContent = session.user.email;
      if (loadedUserId !== session.user.id) {
        loadedUserId = session.user.id;
        loadDashboard(session.user.id);
      }
    } else {
      loadedUserId = null;
      document.getElementById('signed-out-view').style.display = 'flex';
      document.getElementById('signed-in-view').style.display = 'none';
    }
  });

  async function loadDashboard(userId) {
    // Pull the user's collection, joined with card + latest price
    const { data: collection, error: collectionError } = await supabaseClient
      .from('user_collection')
      .select('quantity, variant, card_id, cards(id, name, latest_prices(variant, market_price))')
      .eq('user_id', userId);

    if (collectionError) {
      console.error('Collection query error:', collectionError);
      return;
    }

    const totalCards = collection.reduce((sum, row) => sum + row.quantity, 0);
    const uniqueCards = collection.length;
    const portfolioValue = collection.reduce((sum, row) => {
      const rowVariant = row.variant || 'Normal';
      const priceEntry = row.cards?.latest_prices?.find((p) => p.variant === rowVariant) || row.cards?.latest_prices?.[0];
      const price = priceEntry?.market_price || 0;
      return sum + (price * row.quantity);
    }, 0);

    document.getElementById('stat-value').textContent = '$' + portfolioValue.toFixed(2);
    document.getElementById('stat-unique').textContent = uniqueCards;
    document.getElementById('stat-total').textContent = totalCards;

    // Recently added cards
    const { data: recent, error: recentError } = await supabaseClient
      .from('user_collection')
      .select('added_at, variant, cards(id, name, image_url, rarity, sets(name), latest_prices(variant, market_price))')
      .eq('user_id', userId)
      .order('added_at', { ascending: false })
      .limit(50);

    if (recentError) {
      console.error('Recently added query error:', recentError);
    } else {
      recentCardsRaw = recent;
      renderRecentlyAdded();
    }

    // Master sets + completion
    const { data: masterSets, error: masterSetsError } = await supabaseClient
      .from('user_master_sets')
      .select('sets(id, name, total_cards, games(name))')
      .eq('user_id', userId);

    if (masterSetsError) {
      console.error('Master sets query error:', masterSetsError);
      return;
    }

    document.getElementById('stat-sets-sub').textContent =
      masterSets.length + (masterSets.length === 1 ? ' set' : ' sets');

    const setGrid = document.getElementById('set-grid');
    setGrid.innerHTML = '';

    if (masterSets.length === 0) {
      setGrid.innerHTML = '<div class="empty">No master sets flagged yet. Go to Collection and check "Master set" on a set to track it here.</div>';
      return;
    }

    for (const row of masterSets) {
      const set = row.sets;
      // Count how many unique cards from this set the user owns
      const { count: ownedInSet } = await supabaseClient
        .from('user_collection')
        .select('card_id, cards!inner(set_id)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('cards.set_id', set.id);

      const pct = set.total_cards > 0 ? Math.round(((ownedInSet || 0) / set.total_cards) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'set-card';
      card.innerHTML = `
        <p class="name">${set.name}</p>
        <p class="game">${set.games?.name || ''}</p>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p class="sub" style="margin-top:6px;">${ownedInSet || 0}/${set.total_cards} cards · ${pct}%</p>
      `;
      setGrid.appendChild(card);
    }
  }
</script>

</body>
</html>
