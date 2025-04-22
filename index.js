// ==UserScript==
// @name         RTB ECSR
// @namespace    http://tampermonkey.net/
// @version      1.6.9
// @description  Adds RAP/VALUE stats to user profiles, shows trade values/net differences in trades, and injects “RTB ECSR” button beside Upgrade Now
// @match        https://ecsr.io/*
// @grant        GM_xmlhttpRequest
// @connect      ecomons.vercel.app
// @connect      ecsr.io
// @updateURL    https://raw.githubusercontent.com/AR-Z/RTB-ECSR/main/index.js
// @downloadURL  https://raw.githubusercontent.com/AR-Z/RTB-ECSR/main/index.js
// @icon         https://ecsr.io/favicon.ico
// ==/UserScript==

(function () {
    'use strict';

    console.log("[ECSR] Script loaded");

    // --- Utility ---
    const waitFor = (selector, timeout = 10000) =>
        new Promise(res => {
            const start = Date.now();
            const iv = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) { clearInterval(iv); return res(el); }
                if (Date.now() - start > timeout) { clearInterval(iv); return res(null); }
            }, 100);
        });

    // --- Profile Feature ---
    function isUserProfile() {
        return /^\/users\/\d+\/profile\/?$/.test(location.pathname);
    }

    function updateAvatarImage(userId) {
        const img = document.querySelector('img.avatar');
        if (img) img.src = `https://ecsr.io/thumbs/avatar-headshot.ashx?userId=${userId}`;
    }

    function checkDonationBadge(userId) {
        const url = `https://ecsr.io/users/inventory/list-json?userId=${userId}&assetTypeId=11&cursor=&itemsPerPage=24`;
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            onload(res) {
                if (res.status < 200 || res.status >= 300) return;
                let data;
                try { data = JSON.parse(res.responseText); }
                catch { return; }
                const items = data.items || data.Data?.Items || data.results || [];
                if (!items.some(i => i.Item?.AssetId === 28553)) return;
                waitFor('.profileContainer-0-2-28 span.icon-obc', 15000).then(icon => {
                    if (!icon) return;
                    const old = icon.parentElement.querySelector('img.donation-badge');
                    if (old) old.remove();
                    const badge = document.createElement('img');
                    badge.src = 'data:image/png;base64,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';
                    badge.className = 'donation-badge';
                    badge.alt = 'RTB Donor';
                    badge.title = 'Donor Badge';
                    badge.style.marginLeft = '5px';
                    badge.style.verticalAlign = 'middle';
                    icon.insertAdjacentElement('afterend', badge);
                });
            }
        });
    }

    async function fetchProfileData() {
        const userId = location.pathname.split('/')[2];
        updateAvatarImage(userId);
        checkDonationBadge(userId);
        try {
            const [ , collectibles, items ] = await Promise.all([
                fetch(`https://ecsr.io/apisite/users/v1/users/${userId}/status`, { credentials:'include' }),
                fetch(`https://ecsr.io/apisite/inventory/v1/users/${userId}/assets/collectibles`, { credentials:'include' }).then(r => r.json()),
                new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: 'https://ecomons.vercel.app/api/items',
                        onload(r) {
                            try { resolve(JSON.parse(r.responseText)); }
                            catch { reject(); }
                        },
                        onerror() { reject(); }
                    });
                })
            ]);

            const collArr = Array.isArray(collectibles) ? collectibles : (collectibles.data||[]);
            const rapTotal = collArr.reduce((s,c) => s + (c.recentAveragePrice||0), 0);

            const itemsArr = Array.isArray(items) ? items : (items.data||[]);
            const dict = {};
            itemsArr.forEach(i => {
                if (i.name && typeof i.value === 'number') dict[i.name.trim()] = i.value;
            });
            const valueTotal = collArr.reduce((s,c) => {
                const n = c.name.trim(); return s + (dict[n]||0);
            }, 0);

            const statsContainer = await waitFor('.col-12.col-lg-10.ps-0');
            if (!statsContainer) return;
            const row = statsContainer.querySelector('.row');
            ['#ecsrTradeCalc-rapStat','#ecsrTradeCalc-valueStat'].forEach(sel => {
                const ex = row.querySelector(sel); if (ex) ex.remove();
            });

            function makeStat(id,label,num,link) {
                const d = document.createElement('div');
                d.id = id; d.className = 'col-12 col-lg-2';
                d.innerHTML = `<p class="statHeader-0-2-59">${label}</p>
                               <p class="statValue-0-2-60">
                                 <a href="${link}">${num.toLocaleString()}</a>
                               </p>`;
                return d;
            }

            row.appendChild(makeStat('ecsrTradeCalc-rapStat','RAP',rapTotal,`https://ecsr.io/internal/collectibles?userId=${userId}`));
            row.appendChild(makeStat('ecsrTradeCalc-valueStat','VALUE',valueTotal,`https://ecomons.vercel.app/user/${userId}`));
        } catch (e) {
            console.error("[ECSR] fetchProfileData error", e);
        }
    }

    // --- Trade Modal Feature ---
    let itemDataCache = null;
    function getItemData() {
        if (itemDataCache) return Promise.resolve(itemDataCache);
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://ecomons.vercel.app/api/items',
                onload(r) {
                    let data;
                    try { data = JSON.parse(r.responseText); }
                    catch { return resolve([]); }
                    const arr = Array.isArray(data) ? data : (data.data||[]);
                    itemDataCache = arr; resolve(arr);
                },
                onerror() { resolve([]); }
            });
        });
    }

    function insertTradeItemValues(modal) {
        let ps = modal.querySelectorAll('.itemName-0-2-87');
        if (!ps.length) ps = modal.querySelectorAll('p.trade-item-name');
        if (!ps.length) ps = modal.querySelectorAll('.myCustomItemClass');
        if (!ps.length) return;

        getItemData().then(all => {
            const lookup = {};
            all.forEach(i => { if (i.name && typeof i.value==='number') lookup[i.name.trim()] = i.value; });
            ps.forEach(p => {
                const name = p.querySelector('a')?.textContent.trim() || p.textContent.trim();
                const val = lookup[name];
                const txt = `Value: ${typeof val==='number'?val.toLocaleString():'N/A'}`;
                let span = p.querySelector('.ecsrTradeCalc-inlineValue');
                if (!span) {
                    span = document.createElement('span');
                    span.className = 'ecsrTradeCalc-inlineValue';
                    span.style.display = 'block';
                    span.style.fontSize = '11px';
                    span.style.color = '#099';
                    span.style.marginTop = '2px';
                    p.appendChild(span);
                }
                span.textContent = txt;
            });
            updateTradeTotals(modal);
        });
    }

    function updateTradeTotals(modal) {
        const findH = keys => Array.from(modal.querySelectorAll('p'))
            .find(p => keys.some(k => p.textContent.toUpperCase().includes(k.toUpperCase())));
        const sumSec = header => {
            if (!header) return 0;
            const next = header.closest('.row')?.nextElementSibling;
            if (!next) return 0;
            return Array.from(next.querySelectorAll('p')).reduce((s,p) => {
                const m = p.textContent.match(/Value:\s*([\d,]+)/);
                return m ? s + parseInt(m[1].replace(/,/g,''),10) : s;
            }, 0);
        };
        const gave = sumSec(findH(["ITEMS YOU GAVE","GAVE ITEMS"]));
        const rec = sumSec(findH(["ITEMS YOU RECEIVED","RECEIVED ITEMS"]));
        const insertLbl = (header,val) => {
            if (!header) return;
            const row = header.closest('.row');
            let el = row.querySelector('.ecsrTradeCalc-valueContainer');
            if (!el) {
                el = document.createElement('span');
                el.className = 'ecsrTradeCalc-valueContainer';
                el.style.marginLeft = '8px';
                el.style.fontSize = '12px';
                el.style.color = '#090';
                (row.querySelector('.value-0-2-80')||row).appendChild(el);
            }
            el.textContent = `Value: ${val.toLocaleString()}`;
        };
        insertLbl(findH(["ITEMS YOU GAVE","GAVE ITEMS"]), gave);
        insertLbl(findH(["ITEMS YOU RECEIVED","RECEIVED ITEMS"]), rec);

        const net = rec - gave;
        const partnerP = modal.querySelector('.col-3.divider-right p');
        if (partnerP) {
            let span = partnerP.querySelector('.ecsrTradeCalc-tradeNet');
            if (!span) {
                span = document.createElement('span');
                span.className = 'ecsrTradeCalc-tradeNet';
                span.style.marginLeft = '8px';
                span.style.fontSize = '12px';
                partnerP.appendChild(span);
            }
            span.textContent = `Net: ${net.toLocaleString()}`;
            span.style.color = net<0?'red':'green';
        }
    }

    // --- Item Page Feature ---
    function isItemPage() {
        return /^\/catalog\/\d+\/[^\/]+/.test(location.pathname);
    }

    async function insertItemValue() {
        const container = await waitFor('[class*="catalogItemContainer"]',5000);
        if (!container) return;
        const title = container.querySelector('h1')?.textContent.trim();
        if (!title) return;
        let all = [];
        try {
            const data = await new Promise((res,rej) => {
                GM_xmlhttpRequest({
                    method:'GET',
                    url:'https://ecomons.vercel.app/api/items',
                    onload(r){ try{ res(JSON.parse(r.responseText)); }catch{ rej(); } },
                    onerror(){ rej(); }
                });
            });
            all = Array.isArray(data) ? data : (data.data||[]);
        } catch {}
        const match = all.find(i => i.name.trim()===title);
        const display = match && typeof match.value==='number'
                        ? `R$ ${match.value.toLocaleString()}` : 'N/A';
        const rapP = Array.from(container.querySelectorAll('p'))
                          .find(p => p.textContent.includes('Recent Average Price'));
        if (!rapP) return;
        const existing = document.getElementById('ecsrItemValue');
        if (existing) existing.remove();
        const p = document.createElement('p');
        p.id = 'ecsrItemValue';
        p.className = rapP.className;
        const spanClass = rapP.querySelector('span')?.className || '';
        p.innerHTML = `Value: <span class="${spanClass}">${display}</span>`;
        rapP.parentNode.insertBefore(p, rapP.nextSibling);
    }

    // --- Observers & Init ---
    const TRADE_MODAL_SELECTOR = '.modalWrapper-0-2-74';
    function observeTradeModals() {
        const obs = new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType!==1) return;
                    const modal = node.matches(TRADE_MODAL_SELECTOR)
                                ? node
                                : node.querySelector(TRADE_MODAL_SELECTOR);
                    if (modal && modal.innerText.includes("Trade")) {
                        waitFor('.itemName-0-2-87',10000)
                            .then(() => insertTradeItemValues(modal))
                            .catch(() => insertTradeItemValues(modal));
                    }
                });
            });
        });
        obs.observe(document.body,{childList:true,subtree:true});
    }

    let lastURL = location.href;
    setInterval(() => {
        if (location.href !== lastURL) {
            lastURL = location.href;
            setTimeout(initFeatures,300);
        }
    },500);

    function initFeatures() {
        if (isUserProfile()) fetchProfileData();
        if (isItemPage()) insertItemValue();
        const existingModal = document.querySelector(TRADE_MODAL_SELECTOR);
        if (existingModal) insertTradeItemValues(existingModal);
    }

    observeTradeModals();
    initFeatures();

    // --- Injection: RTB ECSR button using correct selectors ---
    function addRtbButton(origBtn) {
        // Only if not already added
        if (origBtn.parentNode.querySelector('.rtbEcsrButton')) return;
        // Create link+p
        const link = document.createElement('a');
        link.href = 'https://rtbecsr.vercel.app';
        link.target = '_blank';
        const btn = document.createElement('p');
        btn.className = 'upgradeNowButton-0-2-37 rtbEcsrButton';
        btn.textContent = 'RTB ECSR';
        link.appendChild(btn);
        // Insert after original button
        origBtn.parentNode.insertBefore(link, origBtn.nextSibling);
        console.log("[ECSR] addRtbButton: RTB ECSR added");
    }

    // On load, find all upgradeNowButton-0-2-37
    window.addEventListener('load', () => {
        document.querySelectorAll('.upgradeNowButton-0-2-37').forEach(addRtbButton);
        // Observe dynamic inserts
        const obs = new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType!==1) return;
                    if (node.matches('.upgradeNowButton-0-2-37')) {
                        addRtbButton(node);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('.upgradeNowButton-0-2-37').forEach(addRtbButton);
                    }
                });
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    });

})();
