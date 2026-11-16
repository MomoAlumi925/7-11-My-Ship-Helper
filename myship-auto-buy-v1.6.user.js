// ==UserScript==
// @name         7-11 賣貨便自動監控搶購腳本
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  自動偵測賣貨便指定商品與規格庫存（新增商品名稱區塊鎖定，避免多商品同名規格誤觸）
// @author       AI Assistant
// @match        https://myship.7-11.com.tw/general/detail*
// @match        https://myship.7-11.com.tw/cart/confirm*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // 狀態儲存鍵值
    const KEY_RUNNING = 'myship_bot_running';
    const KEY_PRODUCT = 'myship_bot_product';
    const KEY_SPEC = 'myship_bot_spec';
    const KEY_PANEL_POS = 'myship_bot_panel_pos';

    let monitorTimer = null;
    let isInitialized = false;

    // 初始化建立可拖曳懸浮控制面板
    function createControlPanel() {
        if (document.getElementById('myship-bot-panel')) return;

        const savedPos = GM_getValue(KEY_PANEL_POS, { top: '80px', left: '' });
        const panel = document.createElement('div');
        panel.id = 'myship-bot-panel';
        panel.style.cssText = `
            position: fixed;
            top: ${savedPos.top || '80px'};
            ${savedPos.left ? `left: ${savedPos.left};` : 'right: 20px;'}
            z-index: 999999;
            background: #ffffff;
            border: 2px solid #008060;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            font-family: "Microsoft JhengHei", sans-serif;
            width: 255px;
            color: #333;
            user-select: none;
        `;

        const savedProduct = GM_getValue(KEY_PRODUCT, '');
        const savedSpec = GM_getValue(KEY_SPEC, '');
        const isRunning = GM_getValue(KEY_RUNNING, false);

        panel.innerHTML = `
            <div id="bot-drag-handle" title="按住此處可拖曳移動面板" style="font-weight: bold; font-size: 15px; margin-bottom: 10px; color: #008060; border-bottom: 1px solid #eee; padding-bottom: 6px; cursor: move; display: flex; justify-content: space-between; align-items: center;">
                <span>🛒 賣貨便搶購助手 v1.6</span>
                <span style="font-size: 11px; color: #999; font-weight: normal;">✥ 可拖曳</span>
            </div>
            <div style="margin-bottom: 8px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #555;">目標商品名稱 <span style="color:#999;">(多商品時建議填寫)</span>：</label>
                <input type="text" id="bot-product-input" value="${savedProduct.replace(/"/g, '&quot;')}" placeholder="輸入完整或部分商品名稱(可留空)"
                    style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; user-select: text;">
            </div>
            <div style="margin-bottom: 10px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #555;">目標商品規格名稱：</label>
                <input type="text" id="bot-spec-input" value="${savedSpec.replace(/"/g, '&quot;')}" placeholder="請輸入完整或部分規格字樣"
                    style="width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; user-select: text;">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <button id="bot-start-btn" style="flex: 1; padding: 7px; background: #008060; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    開始執行▶
                </button>
                <button id="bot-stop-btn" style="flex: 1; padding: 7px; background: #d9534f; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 13px;">
                    停止運行■
                </button>
            </div>
            <div id="bot-status-text" style="font-size: 12px; color: ${isRunning ? '#008060' : '#888'}; background: #f8f9fa; padding: 6px; border-radius: 4px; text-align: center;">
                狀態：${isRunning ? '準備就緒中...' : '已停止'}
            </div>
        `;

        document.body.appendChild(panel);

        // 啟用拖曳功能
        makeDraggable(panel, document.getElementById('bot-drag-handle'));

        // 綁定按鈕與輸入記憶事件
        document.getElementById('bot-start-btn').addEventListener('click', startBot);
        document.getElementById('bot-stop-btn').addEventListener('click', stopBot);
        document.getElementById('bot-product-input').addEventListener('input', (e) => {
            GM_setValue(KEY_PRODUCT, e.target.value.trim());
        });
        document.getElementById('bot-spec-input').addEventListener('input', (e) => {
            GM_setValue(KEY_SPEC, e.target.value.trim());
        });
    }

    // 面板拖曳與位置記憶邏輯
    function makeDraggable(panel, handle) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            panel.style.right = 'auto';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                GM_setValue(KEY_PANEL_POS, {
                    top: panel.style.top,
                    left: panel.style.left
                });
            }
        });
    }

    // 更新面板狀態文字
    function updateStatus(text, isError = false) {
        const statusEl = document.getElementById('bot-status-text');
        if (statusEl) {
            statusEl.textContent = `狀態：${text}`;
            statusEl.style.color = isError ? '#d9534f' : '#008060';
        }
    }

    // 開始執行
    function startBot() {
        const productInput = document.getElementById('bot-product-input').value.trim();
        const specInput = document.getElementById('bot-spec-input').value.trim();
        if (!specInput) {
            alert('請先輸入「目標商品規格名稱」！');
            return;
        }
        if (monitorTimer) {
            clearInterval(monitorTimer);
            monitorTimer = null;
        }
        GM_setValue(KEY_PRODUCT, productInput);
        GM_setValue(KEY_SPEC, specInput);
        GM_setValue(KEY_RUNNING, true);
        updateStatus('啟動監控中...');
        runLogic(false);
    }

    // 停止運行
    function stopBot() {
        GM_setValue(KEY_RUNNING, false);
        if (monitorTimer) {
            clearInterval(monitorTimer);
            monitorTimer = null;
        }
        updateStatus('已手動停止', true);
    }

    // 單次標準點擊（避免把可切換 Toggle 按鈕連點兩下變成取消選取）
    function singleStandardClick(el) {
        if (!el) return;
        if (typeof el.click === 'function') {
            el.click();
        } else {
            el.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
        }
    }

    // 0. 根據【商品名稱】精準鎖定該商品的獨立卡片容器
    function findProductContainerByName(targetProduct) {
        if (!targetProduct) return null;

        // 尋找包含商品名稱文字的最內層標題或文字節點
        const titleCandidates = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, div, a, label, strong, b')).filter(el => {
            if (el.closest('#myship-bot-panel')) return false;
            if (el.offsetParent === null) return false;
            if (el.children.length > 3) return false;
            const text = (el.textContent || '').trim();
            return text.includes(targetProduct);
        });

        if (titleCandidates.length === 0) return null;

        // 文字越精簡越可能是精確的商品標題元素
        titleCandidates.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);

        for (const titleEl of titleCandidates) {
            let current = titleEl.parentElement;
            let depth = 0;
            while (current && current !== document.body && depth < 14) {
                const hasQtyInput = current.querySelector('input[type="number"], input[type="text"], input[name*="qty"], input[class*="qty"]');
                const checkoutBtns = Array.from(current.querySelectorAll('button, a, input[type="button"], div, span')).filter(
                    el => !el.closest('#myship-bot-panel') && (el.textContent || '').trim() === '直接結帳'
                );

                // 獨立商品卡片必備特徵：包含數量框、只有 1 個「直接結帳」按鈕（避免誤抓包住整個賣場的外層大容器）
                if (hasQtyInput && checkoutBtns.length === 1) {
                    return current;
                }
                current = current.parentElement;
                depth++;
            }
        }

        return null;
    }

    // 1. 精準鎖定單一規格的互動節點（支援限定於指定商品卡片範圍內搜尋）
    function findTargetSpecElement(targetSpec, searchRoot = document) {
        const root = searchRoot || document;
        const allNodes = Array.from(root.querySelectorAll('label, button, a, li, span, div, input[type="radio"]')).filter(el => {
            if (el.closest('#myship-bot-panel')) return false;
            if (el.offsetParent === null && el.tagName !== 'INPUT') return false;
            if (el.children.length > 3) return false;

            if (el.tagName === 'INPUT' && el.type === 'radio') {
                const parentText = el.parentElement ? el.parentElement.textContent.trim() : '';
                return parentText.includes(targetSpec);
            }
            const text = (el.textContent || '').trim();
            return text.includes(targetSpec);
        });

        if (allNodes.length === 0) return null;

        allNodes.sort((a, b) => {
            const lenA = a.tagName === 'INPUT' ? (a.parentElement?.textContent.trim().length || 999) : a.textContent.trim().length;
            const lenB = b.tagName === 'INPUT' ? (b.parentElement?.textContent.trim().length || 999) : b.textContent.trim().length;
            return lenA - lenB;
        });

        let bestMatch = allNodes[0];

        // 向上檢查 1~2 層是否有包裹它的互動容器（限制不可超出 root）
        let parent = bestMatch.parentElement;
        for (let i = 0; i < 2 && parent && parent !== document.body && parent !== root; i++) {
            const cls = (parent.className || '').toString().toLowerCase();
            if (
                parent.tagName === 'LABEL' ||
                parent.tagName === 'BUTTON' ||
                parent.tagName === 'A' ||
                cls.includes('spec') ||
                cls.includes('btn') ||
                cls.includes('tag') ||
                cls.includes('option') ||
                cls.includes('item')
            ) {
                if (parent.textContent.trim().length <= bestMatch.textContent.trim().length + 10) {
                    bestMatch = parent;
                }
            }
            parent = parent.parentElement;
        }

        return bestMatch;
    }

    // 確認該規格是否已經處於「被選中」狀態
    function isSpecSelected(specEl) {
        if (!specEl) return false;
        const radio = specEl.tagName === 'INPUT' ? specEl : specEl.querySelector('input[type="radio"]');
        if (radio && radio.checked) return true;
        if (specEl.tagName === 'LABEL' && specEl.htmlFor) {
            const linkedInput = document.getElementById(specEl.htmlFor);
            if (linkedInput && linkedInput.checked) return true;
        }
        const checkNodes = [specEl, specEl.parentElement, specEl.firstElementChild].filter(Boolean);
        for (const node of checkNodes) {
            const cls = (node.className || '').toString().toLowerCase();
            if (
                cls.includes('active') ||
                cls.includes('selected') ||
                cls.includes('checked') ||
                cls.includes('current') ||
                cls.includes('focus') ||
                node.getAttribute('aria-checked') === 'true' ||
                node.getAttribute('aria-selected') === 'true'
            ) {
                return true;
            }
        }
        return false;
    }

    // 2. 往上尋找該規格所屬的獨立商品卡片容器（備援機制）
    function findProductCardContainer(specEl) {
        let current = specEl.parentElement;
        let depth = 0;
        while (current && current !== document.body && depth < 14) {
            const hasQtyInput = current.querySelector('input[type="number"], input[type="text"], input[name*="qty"], input[class*="qty"]');
            const hasCheckoutBtn = Array.from(current.querySelectorAll('button, a, input[type="button"], div, span')).some(
                el => !el.closest('#myship-bot-panel') && (el.textContent || '').trim() === '直接結帳'
            );
            if (hasQtyInput && hasCheckoutBtn) {
                return current;
            }
            current = current.parentElement;
            depth++;
        }
        return null;
    }

    // 3. 精準將指定商品卡片內的數量設為 1（只能是 1）
    function setCardQuantityToOne(cardContainer) {
        const scope = cardContainer || document;
        const qtyInput = scope.querySelector('input[type="number"], input[name*="qty"], input[class*="qty"], input[type="text"]');
        const plusBtn = Array.from(scope.querySelectorAll('button, a, span, i')).find(
            el => !el.closest('#myship-bot-panel') && (el.textContent.trim() === '+' || el.textContent.trim() === '＋')
        );
        const minusBtn = Array.from(scope.querySelectorAll('button, a, span, i')).find(
            el => !el.closest('#myship-bot-panel') && (el.textContent.trim() === '-' || el.textContent.trim() === '－')
        );

        if (qtyInput) {
            let currentVal = parseInt(qtyInput.value || '0', 10);
            if (isNaN(currentVal)) currentVal = 0;

            if (currentVal === 1) {
                qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            } else if (currentVal === 0) {
                if (plusBtn && !plusBtn.disabled) {
                    singleStandardClick(plusBtn);
                }
                setTimeout(() => {
                    if (parseInt(qtyInput.value || '0', 10) !== 1) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(qtyInput, '1');
                        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, 60);
            } else if (currentVal > 1) {
                if (minusBtn && !minusBtn.disabled) {
                    for (let i = currentVal; i > 1; i--) {
                        singleStandardClick(minusBtn);
                    }
                }
                setTimeout(() => {
                    if (parseInt(qtyInput.value || '0', 10) !== 1) {
                        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                        setter.call(qtyInput, '1');
                        qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
                        qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, 60);
            }
        } else if (plusBtn && !plusBtn.disabled) {
            singleStandardClick(plusBtn);
        }
    }

    // 4. 自動處理「加入成功」彈出確認視窗，點擊第二次「直接結帳」
    function handleCheckoutPopup() {
        let popupAttempts = 0;
        const popupTimer = setInterval(() => {
            popupAttempts++;

            const modals = Array.from(document.querySelectorAll('.modal, [role="dialog"], .popup, .dialog, div')).filter(
                el => !el.closest('#myship-bot-panel') &&
                      el.offsetParent !== null &&
                      el.textContent &&
                      (el.textContent.includes('加入成功') || el.textContent.includes('是否直接前往結帳'))
            );

            if (modals.length > 0) {
                modals.sort((a, b) => a.textContent.length - b.textContent.length);
                const modalEl = modals[0];

                const modalCheckoutBtns = Array.from(modalEl.querySelectorAll('button, a, input[type="button"], div, span')).filter(
                    el => (el.textContent || '').trim() === '直接結帳'
                );

                if (modalCheckoutBtns.length > 0) {
                    clearInterval(popupTimer);
                    singleStandardClick(modalCheckoutBtns[modalCheckoutBtns.length - 1]);
                    updateStatus('已確認彈窗，前往結帳頁...');
                    return;
                }
            }

            if (window.location.href.includes('/cart/confirm') || popupAttempts >= 15) {
                clearInterval(popupTimer);
            }
        }, 200);
    }

    // 商品詳情頁邏輯 (/general/detail*)
    function handleDetailPage() {
        const targetProduct = GM_getValue(KEY_PRODUCT, '');
        const targetSpec = GM_getValue(KEY_SPEC, '');
        if (!targetSpec) {
            stopBot();
            return;
        }

        if (monitorTimer) {
            clearInterval(monitorTimer);
        }

        let checkCount = 0;

        monitorTimer = setInterval(() => {
            if (!GM_getValue(KEY_RUNNING, false)) {
                clearInterval(monitorTimer);
                return;
            }

            checkCount++;

            let targetCard = null;
            let specEl = null;

            if (targetProduct) {
                updateStatus(`鎖定「${targetProduct}」>「${targetSpec}」(${checkCount}次)`);
                targetCard = findProductContainerByName(targetProduct);
                // 若有指定商品名稱，必須先找到對應卡片才搜尋規格，避免誤抓其他商品
                if (targetCard) {
                    specEl = findTargetSpecElement(targetSpec, targetCard);
                }
            } else {
                updateStatus(`偵測「${targetSpec}」(${checkCount}次)`);
                specEl = findTargetSpecElement(targetSpec, document);
            }

            if (specEl) {
                const btnText = (specEl.textContent || '').trim();
                const isSoldOut = btnText.includes('無庫存') ||
                                  btnText.includes('已售完') ||
                                  btnText.includes('缺貨') ||
                                  specEl.disabled ||
                                  specEl.classList.contains('disabled') ||
                                  specEl.classList.contains('soldout') ||
                                  specEl.getAttribute('aria-disabled') === 'true';

                if (!isSoldOut) {
                    updateStatus('發現庫存！單次點選規格中...');
                    clearInterval(monitorTimer);
                    monitorTimer = null;

                    const productCard = targetCard || findProductCardContainer(specEl);

                    // 步驟 1：僅在尚未選中時執行「單次標準點擊」（避免連點兩下被取消選取）
                    if (!isSpecSelected(specEl)) {
                        singleStandardClick(specEl);
                    }

                    // 步驟 2：等待 150ms 讓規格選取反應，再將數量設為 1
                    setTimeout(() => {
                        if (!isSpecSelected(specEl)) {
                            singleStandardClick(specEl);
                            const radio = specEl.tagName === 'INPUT' ? specEl : specEl.querySelector('input[type="radio"]');
                            if (radio && !radio.checked) {
                                radio.checked = true;
                                radio.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }

                        updateStatus('規格已選，設定數量為 1...');
                        setCardQuantityToOne(productCard);

                        // 步驟 3：緩衝 450ms，確保網頁完成規格 ID 綁定與庫存校驗後再點擊「直接結帳」
                        setTimeout(() => {
                            const searchScope = productCard || document;
                            const checkoutBtns = Array.from(searchScope.querySelectorAll('button, a, input[type="button"], div, span')).filter(
                                el => !el.closest('#myship-bot-panel') &&
                                      (el.textContent || '').trim() === '直接結帳' &&
                                      el.offsetParent !== null
                            );

                            if (checkoutBtns.length > 0) {
                                const targetBtn = checkoutBtns[checkoutBtns.length - 1];
                                singleStandardClick(targetBtn);
                                updateStatus('已點選直接結帳，偵測彈窗...');

                                // 步驟 4：處理「加入成功」二次確認視窗
                                handleCheckoutPopup();
                            } else {
                                updateStatus('找不到「直接結帳」按鈕', true);
                            }
                        }, 450);
                    }, 150);

                    return;
                }
            }

            // 若偵測 2 次（約 1 秒）仍無庫存或未找到目標商品，自動重新整理頁面
            if (checkCount >= 2) {
                clearInterval(monitorTimer);
                monitorTimer = null;
                updateStatus(targetProduct && !targetCard ? '未找到目標商品，刷新重試...' : '無庫存，刷新頁面重試...');
                setTimeout(() => {
                    if (GM_getValue(KEY_RUNNING, false)) {
                        location.reload();
                    }
                }, 400);
            }

        }, 500); // 每 0.5 秒偵測一次
    }

    // 結帳確認頁邏輯 (/cart/confirm*)
    function handleConfirmPage() {
        updateStatus('進入結帳頁，尋找同意條款...');

        let attempts = 0;
        const confirmTimer = setInterval(() => {
            attempts++;

            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => !cb.closest('#myship-bot-panel'));
            let targetCheckbox = null;

            for (const cb of checkboxes) {
                const parentText = cb.parentElement ? cb.parentElement.textContent : '';
                const grandParentText = cb.parentElement && cb.parentElement.parentElement ? cb.parentElement.parentElement.textContent : '';
                if (parentText.includes('同意') || grandParentText.includes('同意') || parentText.includes('條款')) {
                    targetCheckbox = cb;
                    break;
                }
            }

            if (!targetCheckbox && checkboxes.length > 0) {
                targetCheckbox = checkboxes[checkboxes.length - 1];
            }

            if (targetCheckbox) {
                if (!targetCheckbox.checked) {
                    singleStandardClick(targetCheckbox);
                    if (!targetCheckbox.checked) {
                        targetCheckbox.checked = true;
                        targetCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }

                if (targetCheckbox.checked) {
                    clearInterval(confirmTimer);
                    GM_setValue(KEY_RUNNING, false);
                    updateStatus('已自動勾選條款！腳本完成並停止');
                    return;
                }
            }

            if (attempts > 20) {
                clearInterval(confirmTimer);
                GM_setValue(KEY_RUNNING, false);
                updateStatus('未找到同意條款框，腳本已停止', true);
            }
        }, 300);
    }

    // 主流程路由判斷（isReload=true 時加入 600ms 頁面渲染就緒緩衝）
    function runLogic(isReload = false) {
        if (!GM_getValue(KEY_RUNNING, false)) return;

        const currentUrl = window.location.href;
        if (currentUrl.includes('/general/detail')) {
            if (isReload) {
                updateStatus('等待網頁渲染就緒 (600ms)...');
                setTimeout(() => {
                    if (GM_getValue(KEY_RUNNING, false)) {
                        handleDetailPage();
                    }
                }, 600);
            } else {
                handleDetailPage();
            }
        } else if (currentUrl.includes('/cart/confirm')) {
            handleConfirmPage();
        }
    }

    // 統一初始化入口（防止 load 與 readyState 重複啟動兩次計時器）
    function initScript() {
        if (isInitialized) return;
        isInitialized = true;
        createControlPanel();
        if (GM_getValue(KEY_RUNNING, false)) {
            runLogic(true);
        }
    }

    if (document.readyState === 'complete') {
        initScript();
    } else {
        window.addEventListener('load', initScript);
    }
})();
