(function () {
    // --- Find Scratch VM ---
    function findScratchVM(root = window) {
        const seen = new Set();
        const queue = [root];
        while (queue.length) {
            const obj = queue.shift();
            if (!obj || typeof obj !== "object") continue;
            if (seen.has(obj)) continue;
            seen.add(obj);
            if (obj.runtime && Array.isArray(obj.runtime.targets)) return obj;
            for (let k in obj) { try { queue.push(obj[k]); } catch {} }
        }
        return null;
    }

    const vm = findScratchVM();
    if (!vm) {
        return console.warn("Scratch VM not found. Headless CSS Bridge not started.");
    }

    console.log("Headless Scratch-to-CSS Bridge is running.");
    console.log("Create variables named 'dom_css_SELECTOR_PROPERTY' to apply styles.");

    const styleTagId = 'scratch-headless-css-bridge';
    let lastAppliedCSS = '';

    // This is the core loop that checks for variable changes and updates styles.
    setInterval(() => {
        if (!vm || !vm.runtime || !vm.runtime.targets) return;

        const collectedRules = {};
        const varRegex = /^dom_css_(.+)_(.+)$/;

        // 1. Scan all variables in all targets (sprites/stage)
        for (const target of vm.runtime.targets) {
            for (const varId in target.variables) {
                const variable = target.variables[varId];
                const match = variable.name.match(varRegex);

                if (match) {
                    const selectorName = match[1];
                    // Allow both background-color and background_color for convenience
                    const propertyName = match[2].replace(/_/g, '-');
                    const propertyValue = variable.value;

                    // Group properties by their selector
                    if (!collectedRules[selectorName]) {
                        collectedRules[selectorName] = {};
                    }
                    collectedRules[selectorName][propertyName] = propertyValue;
                }
            }
        }

        // 2. Build the CSS string from the collected rules
        let newCssString = '';
        for (const selector in collectedRules) {
            // We assume the selector is a class name for safety and simplicity
            newCssString += `.${selector} {\n`;
            for (const prop in collectedRules[selector]) {
                // Basic sanitization: ensure value doesn't contain malicious characters
                const sanitizedValue = String(collectedRules[selector][prop]).replace(/[\;\<\>]/g, '');
                newCssString += `  ${prop}: ${sanitizedValue};\n`;
            }
            newCssString += '}\n';
        }

        // 3. Apply the CSS only if it has changed (for performance)
        if (newCssString !== lastAppliedCSS) {
            lastAppliedCSS = newCssString;

            let styleTag = document.getElementById(styleTagId);
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = styleTagId;
                document.head.appendChild(styleTag);
            }
            
            styleTag.textContent = newCssString;
        }

    }, 150); // Check about 6-7 times per second

})();
