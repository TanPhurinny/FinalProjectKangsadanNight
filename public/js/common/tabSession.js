// อนุญาตให้ล็อกอินคนละ role ได้ในแต่ละแท็บของเบราว์เซอร์เดียวกัน
// เพราะ cookie/session ปกติแชร์กันทุกแท็บ (แท็บล่าสุดที่ login จะไปทับแท็บอื่น)
// เก็บ token แยกต่อแท็บด้วย sessionStorage แล้วแนบไปกับทุก request ของแท็บนั้นแทน
(function () {
    // เบราว์เซอร์รุ่นใหม่ (เช่น Chrome 108+) เก็บหน้าไว้ใน back-forward cache (bfcache) แม้เซิร์ฟเวอร์
    // จะส่ง Cache-Control: no-store มาก็ตาม ทำให้กดปุ่ม "ย้อนกลับ" หลัง logout แล้วยังเห็นหน้าที่ login
    // ค้างอยู่ (เป็นแค่ snapshot เก่า ไม่ได้คุยกับเซิร์ฟเวอร์จริง) ต้อง reload บังคับตอนถูกเรียกคืนจาก bfcache
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            window.location.reload();
        }
    });

    const STORAGE_KEY = 'tabToken';
    const PARAM_KEY = 'tabToken';

    // สำคัญ: ห้ามลบ tabToken ออกจาก URL หลังอ่านค่า เพราะ HTML ของทุกหน้า (รวม navbar ที่โชว์
    // ว่า login เป็นใคร) render ฝั่ง server ก่อน JS จะทำงาน ถ้า refresh หรือพิมพ์ URL เดิมซ้ำ
    // แล้ว query หายไป server จะไม่รู้ว่าแท็บนี้คือใคร แล้วจะ fallback ไปใช้ cookie ที่แชร์กันทุกแท็บทันที
    function readTokenFromUrl() {
        const url = new URL(window.location.href);
        const token = url.searchParams.get(PARAM_KEY);

        if (token) {
            sessionStorage.setItem(STORAGE_KEY, token);
        }

        return token;
    }

    function getTabToken() {
        return readTokenFromUrl() || sessionStorage.getItem(STORAGE_KEY) || null;
    }

    window.getTabToken = getTabToken;
    window.setTabToken = function (token) {
        if (token) {
            sessionStorage.setItem(STORAGE_KEY, token);
        }
    };

    const tabToken = getTabToken();
    if (!tabToken) {
        return;
    }

    function isSameOrigin(url) {
        try {
            return new URL(url, window.location.href).origin === window.location.origin;
        } catch (error) {
            return false;
        }
    }

    function withTabToken(href) {
        const url = new URL(href, window.location.href);
        url.searchParams.set(PARAM_KEY, tabToken);
        return url.pathname + url.search + url.hash;
    }

    // แนบ token กับทุกลิงก์ภายในเว็บก่อนคลิกไป เพื่อให้หน้าถัดไปรู้ว่าแท็บนี้คือใคร
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
            return;
        }

        if (link.target === '_blank' || link.hasAttribute('download')) {
            return;
        }

        if (!isSameOrigin(href)) {
            return;
        }

        // ออกจากระบบ = ล้าง token ของแท็บนี้เท่านั้น ไม่แตะแท็บอื่น
        if (new URL(href, window.location.href).pathname === '/logout') {
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }

        link.setAttribute('href', withTabToken(href));
    }, true);

    // แนบ token กับทุกฟอร์มที่ submit ไปหน้าอื่นในเว็บเดียวกัน
    document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;

        const action = form.getAttribute('action') || window.location.pathname;
        if (!isSameOrigin(action)) return;

        let input = form.querySelector('input[name="' + PARAM_KEY + '"]');
        if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = PARAM_KEY;
            form.appendChild(input);
        }
        input.value = tabToken;
    }, true);

    // แนบ token กับ fetch()/XHR ที่เรียกไป API ของเว็บเดียวกัน (สำหรับสคริปต์หน้า admin/seller)
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input?.url;

        if (url && isSameOrigin(url)) {
            init = init || {};
            const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
            if (!headers.has('Authorization')) {
                headers.set('Authorization', 'Bearer ' + tabToken);
            }
            init.headers = headers;
        }

        return originalFetch(input, init);
    };
})();
