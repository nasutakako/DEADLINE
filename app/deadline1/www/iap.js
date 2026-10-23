// The App Store's in-app purchases for DEADLINE1 (cordova-plugin-purchase v13, which runs under Capacitor).
// The game only knows window.DEADLINE_IAP: price(id), buy(id) -> { ok, msg }, restore() -> [ids bought for good].
// It is defined at once so the shop never shows the site's "free while testing" labels in the app; the calls wait
// until the store is ready.
(() => {
  const ITEMS = ['bomb_emp', 'bomb_grav', 'rk_plasma', 'bs_after', 'bs_thunder', 'dash_warp'].map(id => 'deadline1.item.' + id);
  const PACKS = [50, 100, 250, 500, 750, 1000].map(n => 'deadline1.stars.' + n);
  let store = null, waiting = null, readyFn;
  const ready = new Promise(r => { readyFn = r; });
  document.addEventListener('deviceready', () => {
    if (!window.CdvPurchase) return;
    const { ProductType, Platform } = CdvPurchase; store = CdvPurchase.store;
    store.register([
      ...ITEMS.map(id => ({ id, type: ProductType.NON_CONSUMABLE, platform: Platform.APPLE_APPSTORE })),
      ...PACKS.map(id => ({ id, type: ProductType.CONSUMABLE, platform: Platform.APPLE_APPSTORE })),
    ]);
    // no receipt server: a purchase Apple approves is finished on the device and handed to the game
    store.when().approved(tx => tx.verify()).verified(rc => rc.finish()).finished(tx => {
      if (waiting && tx.products.some(p => p.id === waiting.id)) { waiting.resolve({ ok: true }); waiting = null; }
    });
    store.initialize([Platform.APPLE_APPSTORE]).then(() => readyFn());
  });
  window.DEADLINE_IAP = {
    price(id) { const p = store && store.get(id); return p && p.pricing ? p.pricing.price : null; },
    async buy(id) {
      await ready;
      const p = store.get(id), offer = p && p.getOffer();
      if (!offer) return { ok: false, msg: 'この商品はいま購入できません' };
      return new Promise(resolve => {
        waiting = { id, resolve };
        offer.order().then(err => {
          if (!err) return;   // went through: the finished handler answers
          waiting = null;
          resolve({ ok: false, msg: err.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED ? '購入をキャンセルしました' : '購入できませんでした。もう一度試してね' });
        });
      });
    },
    async restore() { await ready; await store.restorePurchases(); return ITEMS.filter(id => store.owned(id)); },
  };
})();
