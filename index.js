// ==UserScript==
// @name         ECSR Trade Value & Net Calculator (Received - Gave)
// @namespace    http://tampermonkey.net/
// @version      1.6.1
// @description  Adds RAP/VALUE stats to user profiles and shows trade values/net differences in trade modals.
// @match        https://ecsr.io/*
// @grant        GM_xmlhttpRequest
// @connect      ecomons.vercel.app
// @connect      ecsr.io
// ==/UserScript==

(function () {
    'use strict';

    // =============== Utility ===============
    const waitFor = (selector, timeout = 10000) => new Promise(resolve => {
        const interval = 100;
        let waited = 0;
        const check = () => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            waited += interval;
            if (waited >= timeout) return resolve(null);
            setTimeout(check, interval);
        };
        check();
    });

    function fetchDataFromUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            reject(new Error('Error parsing JSON response.'));
                        }
                    } else {
                        reject(new Error(`Error fetching data: ${response.status}`));
                    }
                },
                onerror: function () {
                    reject(new Error('Network error while fetching data.'));
                }
            });
        });
    }

    // =============== Profile Feature ===============
      function isUserProfile() {
        return /^\/users\/\d+\/profile\/?$/.test(window.location.pathname);
    }

    function updateAvatarImage(userId) {
        const avatarImg = document.querySelector('img.avatar');
        if (avatarImg) {
            avatarImg.src = `https://ecsr.io/thumbs/avatar-headshot.ashx?userId=${userId}`;
        }
    }

    async function fetchProfileData() {
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

            const collectiblesArray = Array.isArray(collectiblesData)
                ? collectiblesData
                : (collectiblesData.data || []);
            const rapTotal = collectiblesArray.reduce((sum, col) => sum + (col.recentAveragePrice || 0), 0);

            const itemsArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);
            const itemsDict = itemsArray.reduce((acc, item) => {
                if (item.name && typeof item.value === 'number') {
                    acc[item.name.trim()] = item.value;
                }
                return acc;
            }, {});

            const valueTotal = collectiblesArray.reduce((sum, col) => {
                return sum + (itemsDict[col.name] || 0);
            }, 0);

            const statsRow = await waitFor('.col-12.col-lg-10.ps-0 .row');
            if (statsRow && !document.getElementById('rapStat')) {
                const rapElem = document.createElement('div');
                rapElem.id = 'rapStat';
                rapElem.className = 'col-12 col-lg-2';
                rapElem.innerHTML = `
                    <p class="statHeader-0-2-59">RAP</p>
                    <p class="statValue-0-2-60">
                        <a href="https://ecsr.io/internal/collectibles?userId=${userId}" style="color: inherit; text-decoration: none;">
                            ${rapTotal}
                        </a>
                    </p>`;
                statsRow.appendChild(rapElem);
            }

            if (statsRow && !document.getElementById('valueStat')) {
                const valueElem = document.createElement('div');
                valueElem.id = 'valueStat';
                valueElem.className = 'col-12 col-lg-2';
                valueElem.innerHTML = `
                    <p class="statHeader-0-2-59">VALUE</p>
                    <p class="statValue-0-2-60">
                        <a href="https://ecomons.vercel.app/user/${userId}" style="color: inherit; text-decoration: none;">
                            ${valueTotal}
                        </a>
                    </p>`;
                statsRow.appendChild(valueElem);
            }

        } catch (err) {
            console.error("Error fetching/processing profile data:", err);
        }
    }

    // =============== Trade Modal Feature ===============
    let itemDataCache = null;
    function getItemData() {
        if (itemDataCache) return Promise.resolve(itemDataCache);
        return fetchDataFromUrl('https://ecomons.vercel.app/api/items')
            .then(data => {
                const items = Array.isArray(data) ? data : (data.data || []);
                itemDataCache = items;
                return itemDataCache;
            }).catch(() => []);
    }

    function insertTradeItemValues(modalElem) {
        const itemNameParagraphs = modalElem.querySelectorAll('.itemName-0-2-87');
        if (!itemNameParagraphs.length) return;

        getItemData().then((allItems) => {
            const lookup = {};
            allItems.forEach(item => {
                if (item.name && typeof item.value === 'number') {
                    lookup[item.name.trim()] = item.value;
                }
            });

            itemNameParagraphs.forEach(p => {
                const anchor = p.querySelector('a');
                if (!anchor) return;
                const itemName = anchor.textContent.trim();
                let val = lookup[itemName] || 0;

                if (!p.querySelector('.ecsrTradeCalc-inlineValue')) {
                    const span = document.createElement('span');
                    span.className = 'ecsrTradeCalc-inlineValue';
                    span.style.display = 'block';
                    span.style.fontSize = '10px';
                    span.style.color = '#099';
                    span.style.marginTop = '2px';
                    span.textContent = `(Value: ${val})`;
                    p.appendChild(span);
                }
            });

            updateTradeTotals(modalElem);
        });
    }

    function updateTradeTotals(modalElem) {
        function findHeader(text) {
            return Array.from(modalElem.querySelectorAll('p')).find(p =>
                p.textContent.trim().toUpperCase().includes(text.toUpperCase())
            );
        }

        function sumSection(headerElem) {
            let total = 0;
            if (!headerElem) return total;
            const headerRow = headerElem.closest('.row');
            if (headerRow && headerRow.nextElementSibling) {
                const items = headerRow.nextElementSibling.querySelectorAll('.itemName-0-2-87');
                items.forEach(item => {
                    const valSpan = item.querySelector('.ecsrTradeCalc-inlineValue');
                    if (valSpan) {
                        const match = valSpan.textContent.match(/Value:\s*(\d+)/);
                        if (match) total += parseFloat(match[1]);
                    }
                });
            }
            return total;
        }

        const gaveHeader = findHeader("ITEMS YOU GAVE");
        const receivedHeader = findHeader("ITEMS YOU RECEIVED");
        const gaveSum = sumSection(gaveHeader);
        const receivedSum = sumSection(receivedHeader);

        function insertValueLabel(headerElem, total) {
            if (!headerElem) return;
            const row = headerElem.closest('.row');
            const valueContainer = row?.querySelector('.ecsrTradeCalc-valueContainer');
            if (valueContainer) {
                valueContainer.textContent = `Value: ${total}`;
            } else {
                const container = document.createElement('span');
                container.className = 'ecsrTradeCalc-valueContainer';
                container.style.marginLeft = '8px';
                container.style.fontSize = '12px';
                container.style.color = '#090';
                row.querySelector('.value-0-2-80')?.appendChild(container);
                container.textContent = `Value: ${total}`;
            }
        }

        insertValueLabel(gaveHeader, gaveSum);
        insertValueLabel(receivedHeader, receivedSum);

        // Calculate net as (items received minus items gave)
        const net = receivedSum - gaveSum;
        const partnerDiv = modalElem.querySelector('.col-3.divider-right');
        if (partnerDiv) {
            const partnerP = partnerDiv.querySelector('p');
            if (partnerP) {
                let netSpan = partnerP.querySelector('.ecsrTradeCalc-tradeNet');
                if (!netSpan) {
                    netSpan = document.createElement('span');
                    netSpan.className = 'ecsrTradeCalc-tradeNet';
                    netSpan.style.marginLeft = '8px';
                    netSpan.style.fontSize = '12px';
                    partnerP.appendChild(netSpan);
                }
                netSpan.textContent = `(Net: ${net})`;
                netSpan.style.color = net < 0 ? 'red' : 'green';
            }
        }
    }

    // =============== DOM Observers and Initialization ===============
    const TRADE_MODAL_SELECTOR = '.modalWrapper-0-2-74';
    function observeTradeModals() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches(TRADE_MODAL_SELECTOR)) {
                            setTimeout(() => insertTradeItemValues(node), 300);
                        } else {
                            const inside = node.querySelector(TRADE_MODAL_SELECTOR);
                            if (inside) {
                                setTimeout(() => insertTradeItemValues(inside), 300);
                            }
                        }
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function detectRouteChange(callback) {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                callback();
            }
        }).observe(document, { subtree: true, childList: true });
    }

    function initFeatures() {
        if (isUserProfile()) fetchProfileData();
        const existingModal = document.querySelector(TRADE_MODAL_SELECTOR);
        if (existingModal) insertTradeItemValues(existingModal);
    }

    detectRouteChange(initFeatures);
    observeTradeModals();
    initFeatures(); // initial load
})();
