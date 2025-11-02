(function(window) {
    const GTM_ID = 'GTM-KBT3PGNF';

    window.initGTM = function() {
        if (typeof window !== 'undefined') {
            (function(w, d, s, l, i) {
                w[l] = w[l] || [];
                w[l].push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
                const f = d.getElementsByTagName(s)[0];
                const j = d.createElement(s);
                const dl = l != 'dataLayer' ? '&l=' + l : '';
                j.async = true;
                j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
                f.parentNode.insertBefore(j, f);
            })(window, document, 'script', 'dataLayer', GTM_ID);
        }
    };

    window.pushToDataLayer = function(event) {
        if (typeof window !== 'undefined' && window.dataLayer) {
            window.dataLayer.push(event);
        }
    };

    window.initGTM();
})(window); 