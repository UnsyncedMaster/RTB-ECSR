// ==UserScript==
// @name         ECSR Trade Value Thing
// @namespace    http://tampermonkey.net/
// @version      1.6.1
// @description  Adds RAP/VALUE stats to user profiles and shows trade values/net differences in trades
// @match        https://ecsr.io/*
// @grant        GM_xmlhttpRequest
// @connect      ecomons.vercel.app
// @connect      ecsr.io
// @updateURL    https://raw.githubusercontent.com/AR-Z/RTB-ECSR/main/index.js
// @downloadURL  https://raw.githubusercontent.com/AR-Z/RTB-ECSR/main/index.js
// ==/UserScript==
(function () {
    'use strict';

    console.log('[ECSR] Script loaded');

    // --- Utility Functions ---
    const waitFor = (selector, timeout = 10000) =>
        new Promise(resolve => {
            const interval = 100, start = Date.now();
            const check = () => {
                const el = document.querySelector(selector);
                if (el) {
                    console.log(`[ECSR] waitFor: found ${selector}`);
                    return resolve(el);
                }
                if (Date.now() - start >= timeout) {
                    console.warn(`[ECSR] waitFor: timeout waiting for ${selector}`);
                    return resolve(null);
                }
                setTimeout(check, interval);
            };
            check();
        });

    function fetchDataFromUrl(url) {
        console.log(`[ECSR] fetchDataFromUrl: fetching ${url}`);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            console.log('[ECSR] fetchDataFromUrl: parsed JSON', data);
                            resolve(data);
                        } catch (e) {
                            console.error('[ECSR] fetchDataFromUrl: JSON parse error', e);
                            reject(new Error('Error parsing JSON response.'));
                        }
                    } else {
                        console.error('[ECSR] fetchDataFromUrl: HTTP error', response.status);
                        reject(new Error(`Error fetching data: ${response.status}`));
                    }
                },
                onerror: function (err) {
                    console.error('[ECSR] fetchDataFromUrl: network error', err);
                    reject(new Error('Network error while fetching data.'));
                }
            });
        });
    }

    // --- Profile Feature ---
    function isUserProfile() {
        return /^\/users\/\d+\/profile\/?$/.test(window.location.pathname);
    }

    function updateAvatarImage(userId) {
        const avatarImg = document.querySelector('img.avatar');
        if (avatarImg) {
            avatarImg.src = `https://ecsr.io/thumbs/avatar-headshot.ashx?userId=${userId}`;
            console.log(`[ECSR] updateAvatarImage: updated avatar for user ${userId}`);
        }
    }

    async function fetchProfileData() {
        console.log('[ECSR] fetchProfileData: start');
        const pathParts = window.location.pathname.split('/');
        const userId = pathParts[2];
        updateAvatarImage(userId);

        const statusUrl = `https://ecsr.io/apisite/users/v1/users/${userId}/status`;
        const collectiblesUrl = `https://ecsr.io/apisite/inventory/v1/users/${userId}/assets/collectibles`;
        const itemsUrl = `https://ecomons.vercel.app/api/items`;

        try {
            const [statusData, collectiblesData, itemsData] = await Promise.all([
                fetch(statusUrl, { credentials: 'include' }).then(r => r.json()),
                fetch(collectiblesUrl, { credentials: 'include' }).then(r => r.json()),
                fetchDataFromUrl(itemsUrl)
            ]);
            console.log('[ECSR] fetchProfileData: fetched all data');

            const collectiblesArray = Array.isArray(collectiblesData)
                ? collectiblesData
                : (collectiblesData.data || []);
            const rapTotal = collectiblesArray.reduce((sum, col) => sum + (col.recentAveragePrice || 0), 0);
            console.log('[ECSR] fetchProfileData: RAP total', rapTotal);

            const itemsArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);
            const itemsDict = itemsArray.reduce((acc, item) => {
                if (item.name && typeof item.value === 'number') {
                    acc[item.name.trim()] = item.value;
                }
                return acc;
            }, {});
            console.log('[ECSR] fetchProfileData: built itemsDict');

            const valueTotal = collectiblesArray.reduce((sum, col) => {
                return sum + (itemsDict[col.name] || 0);
            }, 0);
            console.log('[ECSR] fetchProfileData: VALUE total', valueTotal);

            const statsContainer = await waitFor('.col-12.col-lg-10.ps-0');
            if (!statsContainer) return;
            const statsRow = statsContainer.querySelector('.row');
            if (!statsRow) return;

            // Remove any existing RAP/VALUE blocks
            ['#ecsrTradeCalc-rapStat', '#ecsrTradeCalc-valueStat'].forEach(sel => {
                const ex = statsRow.querySelector(sel);
                if (ex) {
                    ex.remove();
                    console.log(`[ECSR] fetchProfileData: removed existing ${sel}`);
                }
            });

            // Create stat blocks using the same CSS classes as Friends/Followers/Following
            const createStatBlock = (id, label, number, link) => {
                const div = document.createElement('div');
                div.id = id;
                div.className = 'col-12 col-lg-2';
                div.innerHTML = `
                    <p class="statHeader-0-2-59">${label}</p>
                    <p class="statValue-0-2-60">
                        <a href="${link}">${number.toLocaleString()}</a>
                    </p>`;
                return div;
            };

            statsRow.appendChild(createStatBlock(
                'ecsrTradeCalc-rapStat',
                'RAP',
                rapTotal,
                `https://ecsr.io/internal/collectibles?userId=${userId}`
            ));

            statsRow.appendChild(createStatBlock(
                'ecsrTradeCalc-valueStat',
                'VALUE',
                valueTotal,
                `https://ecomons.vercel.app/user/${userId}`
            ));
            console.log('[ECSR] fetchProfileData: appended RAP & VALUE blocks');
        } catch (err) {
            console.error('[ECSR] fetchProfileData: error', err);
        }
    }

    // --- Trade Modal Feature ---
    let itemDataCache = null;
    function getItemData() {
        if (itemDataCache) {
            console.log('[ECSR] getItemData: using cache');
            return Promise.resolve(itemDataCache);
        }
        console.log('[ECSR] getItemData: fetching new');
        return fetchDataFromUrl('https://ecomons.vercel.app/api/items')
            .then(data => {
                const items = Array.isArray(data) ? data : (data.data || []);
                itemDataCache = items;
                console.log('[ECSR] getItemData: cached items');
                return items;
            }).catch(err => {
                console.error('[ECSR] getItemData: error', err);
                return [];
            });
    }

    function insertTradeItemValues(modalElem) {
        console.log('[ECSR] insertTradeItemValues: start');
        // Try the original selector
        let itemNameParagraphs = modalElem.querySelectorAll('.itemName-0-2-87');
        // Fallback: try a different selector (adjust as needed)
        if (!itemNameParagraphs.length) {
            itemNameParagraphs = modalElem.querySelectorAll('p.trade-item-name');
        }
        // Another fallback: try a custom class if you use one
        if (!itemNameParagraphs.length) {
            itemNameParagraphs = modalElem.querySelectorAll('.myCustomItemClass');
        }
        if (!itemNameParagraphs.length) {
            console.log('[ECSR] insertTradeItemValues: no trade item elements found');
            return;
        }

        getItemData().then((allItems) => {
            const lookup = {};
            allItems.forEach(item => {
                if (item.name && typeof item.value === 'number') {
                    lookup[item.name.trim()] = item.value;
                }
            });

            itemNameParagraphs.forEach(p => {
                // Use the <a> text if available; otherwise use the element's text
                const anchor = p.querySelector('a');
                const itemName = anchor
                    ? anchor.textContent.trim()
                    : p.textContent.trim();

                if (!itemName) return;

                const val = lookup[itemName];
                const display = typeof val === 'number' ? val.toLocaleString() : 'N/A';
                console.log(`[ECSR] insertTradeItemValues: ${itemName} → ${display}`);

                let valueSpan = p.querySelector('.ecsrTradeCalc-inlineValue');
                if (!valueSpan) {
                    valueSpan = document.createElement('span');
                    valueSpan.className = 'ecsrTradeCalc-inlineValue';
                    valueSpan.style.display = 'block';
                    valueSpan.style.fontSize = '11px';
                    valueSpan.style.color = '#099';
                    valueSpan.style.marginTop = '2px';
                    p.appendChild(valueSpan);
                }
                valueSpan.textContent = `Value: ${display}`;
            });

            updateTradeTotals(modalElem);
        });
    }

    function updateTradeTotals(modalElem) {
        console.log('[ECSR] updateTradeTotals: start');
        function findHeader(texts) {
            return Array.from(modalElem.querySelectorAll('p')).find(p =>
                texts.some(t => p.textContent.trim().toUpperCase().includes(t.toUpperCase()))
            );
        }
        function sumSection(headerElem) {
            let total = 0;
            if (!headerElem) return total;
            const headerRow = headerElem.closest('.row');
            if (headerRow && headerRow.nextElementSibling) {
                headerRow.nextElementSibling.querySelectorAll('p').forEach(item => {
                    const valSpan = item.querySelector('.ecsrTradeCalc-inlineValue');
                    if (valSpan) {
                        const match = valSpan.textContent.match(/Value:\s*(\d{1,3}(?:,\d{3})*)/);
                        if (match) total += parseFloat(match[1].replace(/,/g, ''));
                    }
                });
            }
            return total;
        }

        const gaveSum = sumSection(findHeader(["ITEMS YOU GAVE", "Gave Items"]));
        const receivedSum = sumSection(findHeader(["ITEMS YOU RECEIVED", "Received Items"]));
        console.log(`[ECSR] updateTradeTotals: gave=${gaveSum}, received=${receivedSum}`);

        function insertValueLabel(headerElem, total) {
            if (!headerElem) return;
            const row = headerElem.closest('.row');
            let valueContainer = row.querySelector('.ecsrTradeCalc-valueContainer');
            if (valueContainer) {
                valueContainer.textContent = `Value: ${total.toLocaleString()}`;
            } else {
                valueContainer = document.createElement('span');
                valueContainer.className = 'ecsrTradeCalc-valueContainer';
                valueContainer.style.marginLeft = '8px';
                valueContainer.style.fontSize = '12px';
                valueContainer.style.color = '#090';
                (row.querySelector('.value-0-2-80') || row).appendChild(valueContainer);
                valueContainer.textContent = `Value: ${total.toLocaleString()}`;
            }
        }

        insertValueLabel(findHeader(["ITEMS YOU GAVE", "Gave Items"]), gaveSum);
        insertValueLabel(findHeader(["ITEMS YOU RECEIVED", "Received Items"]), receivedSum);

        const net = receivedSum - gaveSum;
        console.log(`[ECSR] updateTradeTotals: net=${net}`);
        const partnerP = modalElem.querySelector('.col-3.divider-right p');
        if (partnerP) {
            let netSpan = partnerP.querySelector('.ecsrTradeCalc-tradeNet');
            if (!netSpan) {
                netSpan = document.createElement('span');
                netSpan.className = 'ecsrTradeCalc-tradeNet';
                netSpan.style.marginLeft = '8px';
                netSpan.style.fontSize = '12px';
                partnerP.appendChild(netSpan);
            }
            netSpan.textContent = `Net: ${net.toLocaleString()}`;
            netSpan.style.color = net < 0 ? 'red' : 'green';
        }
    }

    // --- Item Page Feature ---
    function isItemPage() {
        return /^\/catalog\/\d+\/[^\/]+/.test(location.pathname);
    }

    async function insertItemValue() {
        console.log('[ECSR] insertItemValue: start');
        try {
            const container = await waitFor('[class*="catalogItemContainer"]', 10000);
            if (!container) {
                console.warn('[ECSR] insertItemValue: no catalogItemContainer found');
                return;
            }
            const titleElem = container.querySelector('h1');
            if (!titleElem) {
                console.warn('[ECSR] insertItemValue: no <h1> in container');
                return;
            }
            const itemName = titleElem.textContent.trim();
            console.log('[ECSR] insertItemValue: itemName =', itemName);

            let allItems = [];
            try {
                const data = await fetchDataFromUrl('https://ecomons.vercel.app/api/items');
                allItems = Array.isArray(data) ? data : (data.data || []);
                console.log('[ECSR] insertItemValue: fetched allItems, count =', allItems.length);
            } catch (e) {
                console.error('[ECSR] insertItemValue: fetchDataFromUrl failed', e);
            }

            const match = allItems.find(i => i.name.trim() === itemName);
            console.log('[ECSR] insertItemValue: matched item data =', match);
            const displayValue = (match && typeof match.value === 'number')
                ? `R$ ${match.value.toLocaleString()}`
                : 'N/A';
            console.log('[ECSR] insertItemValue: displayValue =', displayValue);

            const rapP = Array.from(container.querySelectorAll('p'))
                .find(p => p.textContent.includes('Recent Average Price'));
            if (!rapP) {
                console.warn('[ECSR] insertItemValue: no RAP <p> found');
                return;
            }

            const existing = document.getElementById('ecsrItemValue');
            if (existing) {
                existing.remove();
                console.log('[ECSR] insertItemValue: removed old valueP');
            }

            const valueP = document.createElement('p');
            valueP.id = 'ecsrItemValue';
            valueP.className = rapP.className;
            const spanClass = rapP.querySelector('span')?.className || '';
            valueP.innerHTML = `Value: <span class="${spanClass}">${displayValue}</span>`;
            rapP.parentNode.insertBefore(valueP, rapP.nextSibling);
            console.log('[ECSR] insertItemValue: inserted new valueP');
        } catch (err) {
            console.error('[ECSR] insertItemValue: unexpected error', err);
        }
    }

    // --- DOM Observers and Initialization ---
    const TRADE_MODAL_SELECTOR = '.modalWrapper-0-2-74';
    function observeTradeModals() {
        console.log('[ECSR] observeTradeModals: start');
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches(TRADE_MODAL_SELECTOR) ||
                            (node.innerText && node.innerText.includes("Trade Request"))) {
                            console.log('[ECSR] observeTradeModals: detected trade modal');
                            setTimeout(() => insertTradeItemValues(node), 300);
                        } else {
                            const tradeBox = node.querySelector(TRADE_MODAL_SELECTOR);
                            if (tradeBox) {
                                console.log('[ECSR] observeTradeModals: detected nested trade modal');
                                setTimeout(() => insertTradeItemValues(tradeBox), 300);
                            }
                        }
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    let lastURL = location.href;
    setInterval(() => {
        if (location.href !== lastURL) {
            console.log('[ECSR] URL changed:', location.href);
            lastURL = location.href;
            setTimeout(initFeatures, 300);
        }
    }, 500);

    function initFeatures() {
        console.log('[ECSR] initFeatures: running on', location.pathname);
        if (isUserProfile()) {
            console.log('[ECSR] initFeatures: detected user profile');
            fetchProfileData();
        }
        if (isItemPage()) {
            console.log('[ECSR] initFeatures: detected item page');
            insertItemValue();
        }
        // Only run the trade modal feature if we are NOT on the trade listing page
        if (!location.pathname.includes('/My/Trades.aspx')) {
            const existingModal = document.querySelector(TRADE_MODAL_SELECTOR);
            if (existingModal) {
                console.log('[ECSR] initFeatures: existing trade modal on load');
                insertTradeItemValues(existingModal);
            }
        }
    }

    observeTradeModals();
    initFeatures();
})();
