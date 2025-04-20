// ==UserScript==
// @name         RTB ECSR
// @namespace    ARZ
// @version      1.6.4-fixed-csp
// @description  Adds RAP/VALUE stats to user profiles, shows trade values/net differences in trades, and adds a donation badge if the user owns a donation shirt.
// @match        https://ecsr.io/*
// @grant        GM_xmlhttpRequest
// @connect      ecomons.vercel.app
// @connect      ecsr.io
// @icon         https://ecsr.io/favicon.ico
// ==/UserScript==

(function () {
    'use strict';

    console.log("[ECSR] Script loaded");

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

    function waitForElements(selector, root = document, timeout = 10000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const interval = setInterval(() => {
                const elems = root.querySelectorAll(selector);
                if (elems.length > 0 || Date.now() - start >= timeout) {
                    clearInterval(interval);
                    resolve(elems);
                }
            }, 100);
        });
    }

    // Wait for trade items within a modal.
    function waitForTradeItems(modal, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const selectors = '.itemName-0-2-87, p.trade-item-name, .myCustomItemClass';
            const start = Date.now();
            function check() {
                const items = modal.querySelectorAll(selectors);
                if (items.length > 0) {
                    console.log("[ECSR] waitForTradeItems: found trade items", items);
                    return resolve(items);
                }
                if (Date.now() - start >= timeout) {
                    return reject(new Error('Timeout waiting for trade items'));
                }
                setTimeout(check, 300);
            }
            check();
        });
    }

    function fetchDataFromUrl(url) {
        console.log(`[ECSR] fetchDataFromUrl: fetching ${url}`);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            console.log("[ECSR] fetchDataFromUrl: parsed JSON", data);
                            resolve(data);
                        } catch (e) {
                            console.error("[ECSR] fetchDataFromUrl: JSON parse error", e);
                            reject(new Error('Error parsing JSON response.'));
                        }
                    } else {
                        console.error("[ECSR] fetchDataFromUrl: HTTP error", response.status);
                        reject(new Error(`Error fetching data: ${response.status}`));
                    }
                },
                onerror(err) {
                    console.error("[ECSR] fetchDataFromUrl: network error", err);
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

    // Donation badge check function (polls directly for the icon span)
    function checkDonationBadge(userId) {
        const donationShirtId = 28553; // Donation shirt ID
        const url = `https://ecsr.io/users/inventory/list-json?userId=${userId}&assetTypeId=11&cursor=&itemsPerPage=24`;
        console.log(`[ECSR] checkDonationBadge: Fetching inventory from ${url}`);
        GM_xmlhttpRequest({
            method: "GET",
            url,
            onload(response) {
                if (response.status < 200 || response.status >= 300) {
                    return console.error(`[ECSR] checkDonationBadge: HTTP error ${response.status}`);
                }
                let data;
                try {
                    data = JSON.parse(response.responseText);
                } catch (e) {
                    return console.error("[ECSR] checkDonationBadge: JSON parse error", e);
                }
                const items = data.items || data.Data?.Items || data.results || [];
                const hasShirt = items.some(i => i.Item?.AssetId == donationShirtId);
                if (!hasShirt) {
                    return console.log("[ECSR] checkDonationBadge: Donation shirt NOT found.");
                }

                // Now wait for the actual icon span to appear anywhere in the profile container
                waitFor('.profileContainer-0-2-28 span.icon-obc', 15000).then(obcIcon => {
                    if (!obcIcon) {
                        return console.warn("[ECSR] checkDonationBadge: OBC icon still not found after waiting");
                    }
                    // Remove any existing badge
                    const oldBadge = obcIcon.parentElement.querySelector('img.donation-badge');
                    if (oldBadge) oldBadge.remove();

                    // ←――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――
                    // ** ONLY changed this one line to use a data: URI so CSP allows it **
                    // original badge.src = 'https://via.placeholder.com/20';
                    const badge = document.createElement('img');
                    badge.src = 'data:image/png;base64,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';
                    badge.className = 'donation-badge';
                    badge.alt = 'RTB Donor';
                    badge.title = 'Donor Badge';
                    badge.style.marginLeft = '5px';
                    badge.style.verticalAlign = 'middle';
                    obcIcon.insertAdjacentElement('afterend', badge);
                    console.log("[ECSR] checkDonationBadge: Donation badge inserted.");
                });
            },
            onerror(err) {
                console.error("[ECSR] checkDonationBadge: Network error", err);
            }
        });
    }

    async function fetchProfileData() {
        console.log("[ECSR] fetchProfileData: start");
        const pathParts = window.location.pathname.split('/');
        const userId = pathParts[2];
        updateAvatarImage(userId);
        checkDonationBadge(userId);

        const statusUrl = `https://ecsr.io/apisite/users/v1/users/${userId}/status`;
        const collectiblesUrl = `https://ecsr.io/apisite/inventory/v1/users/${userId}/assets/collectibles`;
        const itemsUrl = `https://ecomons.vercel.app/api/items`;

        try {
            const [statusData, collectiblesData, itemsData] = await Promise.all([
                fetch(statusUrl, { credentials: 'include' }).then(r => r.json()),
                fetch(collectiblesUrl, { credentials: 'include' }).then(r => r.json()),
                fetchDataFromUrl(itemsUrl)
            ]);
            console.log("[ECSR] fetchProfileData: fetched all data");

            const collectiblesArray = Array.isArray(collectiblesData)
                ? collectiblesData
                : (collectiblesData.data || []);
            const rapTotal = collectiblesArray.reduce((sum, col) => sum + (col.recentAveragePrice || 0), 0);
            console.log("[ECSR] fetchProfileData: RAP total, rapTotal");

            const itemsArray = Array.isArray(itemsData) ? itemsData : (itemsData.data || []);
            const itemsDict = itemsArray.reduce((acc, item) => {
                if (item.name && typeof item.value === 'number') {
                    acc[item.name.trim()] = item.value;
                }
                return acc;
            }, {});
            console.log("[ECSR] fetchProfileData: built itemsDict");

            const valueTotal = collectiblesArray.reduce((sum, col) => {
                const name = col.name.trim();
                return sum + (itemsDict[name] || 0);
            }, 0);
            console.log("[ECSR] fetchProfileData: VALUE total, valueTotal");

            const statsContainer = await waitFor('.col-12.col-lg-10.ps-0');
            if (!statsContainer) return;
            const statsRow = statsContainer.querySelector('.row');
            if (!statsRow) return;

            ['#ecsrTradeCalc-rapStat', '#ecsrTradeCalc-valueStat'].forEach(sel => {
                const ex = statsRow.querySelector(sel);
                if (ex) {
                    ex.remove();
                    console.log(`[ECSR] fetchProfileData: removed existing ${sel}`);
                }
            });

            const createStatBlock = (id, label, number, link) => {
                const div = document.createElement('div');
                div.id = id;
                div.className = 'col-12 col-lg-2';
                div.innerHTML =
                    `<p class="statHeader-0-2-59">${label}</p>
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
            console.log("[ECSR] fetchProfileData: appended RAP & VALUE blocks");
        } catch (err) {
            console.error("[ECSR] fetchProfileData: error", err);
        }
    }

    // --- Trade Modal Feature ---
    let itemDataCache = null;
    function getItemData() {
        if (itemDataCache) {
            console.log("[ECSR] getItemData: using cache");
            return Promise.resolve(itemDataCache);
        }
        console.log("[ECSR] getItemData: fetching new");
        return fetchDataFromUrl('https://ecomons.vercel.app/api/items')
            .then(data => {
                const items = Array.isArray(data) ? data : (data.data || []);
                itemDataCache = items;
                console.log("[ECSR] getItemData: cached items");
                return items;
            }).catch(err => {
                console.error("[ECSR] getItemData: error", err);
                return [];
            });
    }

    function insertTradeItemValues(modalElem) {
        console.log("[ECSR] insertTradeItemValues: start");
        let itemNameParagraphs = modalElem.querySelectorAll('.itemName-0-2-87');
        if (!itemNameParagraphs.length) itemNameParagraphs = modalElem.querySelectorAll('p.trade-item-name');
        if (!itemNameParagraphs.length) itemNameParagraphs = modalElem.querySelectorAll('.myCustomItemClass');
        if (!itemNameParagraphs.length) {
            console.log("[ECSR] insertTradeItemValues: no trade item elements found");
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
                const anchor = p.querySelector('a');
                const itemName = anchor ? anchor.textContent.trim() : p.textContent.trim();
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
        console.log("[ECSR] updateTradeTotals: start");
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
        console.log("[ECSR] insertItemValue: start");
        try {
            const container = await waitFor('[class*="catalogItemContainer"]', 10000);
            if (!container) {
                console.warn("[ECSR] insertItemValue: no catalogItemContainer found");
                return;
            }
            const titleElem = container.querySelector('h1');
            if (!titleElem) {
                console.warn("[ECSR] insertItemValue: no <h1> in container");
                return;
            }
            const itemName = titleElem.textContent.trim();
            console.log("[ECSR] insertItemValue: itemName =", itemName);

            let allItems = [];
            try {
                const data = await fetchDataFromUrl('https://ecomons.vercel.app/api/items');
                allItems = Array.isArray(data) ? data : (data.data || []);
                console.log("[ECSR] insertItemValue: fetched allItems, count =", allItems.length);
            } catch (e) {
                console.error("[ECSR] insertItemValue: fetchDataFromUrl failed, e", e);
            }

            const match = allItems.find(i => i.name.trim() === itemName);
            console.log("[ECSR] insertItemValue: matched item data =", match);
            const displayValue = (match && typeof match.value === 'number')
                ? `R$ ${match.value.toLocaleString()}`
                : 'N/A';
            console.log("[ECSR] insertItemValue: displayValue =", displayValue);

            const rapP = Array.from(container.querySelectorAll('p'))
                .find(p => p.textContent.includes('Recent Average Price'));
            if (!rapP) {
                console.warn("[ECSR] insertItemValue: no RAP <p> found");
                return;
            }

            const existing = document.getElementById('ecsrItemValue');
            if (existing) {
                existing.remove();
                console.log("[ECSR] insertItemValue: removed old valueP");
            }

            const valueP = document.createElement('p');
            valueP.id = 'ecsrItemValue';
            valueP.className = rapP.className;
            const spanClass = rapP.querySelector('span') ? rapP.querySelector('span').className : '';
            valueP.innerHTML = `Value: <span class="${spanClass}">${displayValue}</span>`;
            rapP.parentNode.insertBefore(valueP, rapP.nextSibling);
            console.log("[ECSR] insertItemValue: inserted new valueP");
        } catch (err) {
            console.error("[ECSR] insertItemValue: unexpected error, err", err);
        }
    }

    // --- DOM Observers and Initialization ---
    const TRADE_MODAL_SELECTOR = '.modalWrapper-0-2-74';
    function observeTradeModals() {
        console.log("[ECSR] observeTradeModals: start");
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.matches(TRADE_MODAL_SELECTOR) ||
                            (node.innerText && node.innerText.includes("Trade Request"))) {
                            console.log("[ECSR] observeTradeModals: detected trade modal");
                            waitForTradeItems(node, 10000).then(() => {
                                insertTradeItemValues(node);
                            }).catch(err => {
                                console.warn("[ECSR] observeTradeModals:", err.message, "— proceeding with insertion");
                                insertTradeItemValues(node);
                            });
                        } else {
                            const tradeBox = node.querySelector(TRADE_MODAL_SELECTOR);
                            if (tradeBox) {
                                console.log("[ECSR] observeTradeModals: detected nested trade modal");
                                waitForTradeItems(tradeBox, 10000).then(() => {
                                    insertTradeItemValues(tradeBox);
                                }).catch(err => {
                                    console.warn("[ECSR] observeTradeModals (nested):", err.message, "— proceeding with insertion");
                                    insertTradeItemValues(tradeBox);
                                });
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
            console.log("[ECSR] URL changed:", location.href);
            lastURL = location.href;
            setTimeout(initFeatures, 300);
        }
    }, 500);

    function initFeatures() {
        console.log("[ECSR] initFeatures: running on", location.pathname);
        if (isUserProfile()) {
            console.log("[ECSR] initFeatures: detected user profile");
            fetchProfileData();
        }
        if (isItemPage()) {
            console.log("[ECSR] initFeatures: detected item page");
            insertItemValue();
        }
        if (!location.pathname.includes('/My/Trades.aspx')) {
            const existingModal = document.querySelector(TRADE_MODAL_SELECTOR);
            if (existingModal) {
                console.log("[ECSR] initFeatures: existing trade modal on load");
                insertTradeItemValues(existingModal);
            }
        }
    }

    observeTradeModals();
    initFeatures();

})();
