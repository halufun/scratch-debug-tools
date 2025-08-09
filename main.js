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
            for (let k in obj) {
                try { queue.push(obj[k]); } catch {}
            }
        }
        return null;
    }

    const vm = findScratchVM();
    if (!vm) return console.warn("VM not found.");
    window.hack = window.hack || {};
    hack.vm = vm;
    hack.importedDefinitions = hack.importedDefinitions || {};

    hack.runOpcode = function (targetName, opcode, args = {}) {
        const target = vm.runtime.targets.find(t => t.getName() === targetName);
        if (!target) return alert(`Target '${targetName}' not found`);
        const fn = vm.runtime._primitives[opcode];
        if (!fn) return alert(`Opcode function '${opcode}' not found in VM runtime. Is the extension loaded?`);
        try { fn(args, { target }); } catch (e) { alert(e); }
    };

    function getAllVarsAndLists() {
        const variables = [], lists = [];
        if (!vm || !vm.runtime || !vm.runtime.targets) return { variables, lists };
        vm.runtime.targets.forEach(target => {
            if (!target.variables) return;
            for (const varId in target.variables) {
                const v = target.variables[varId];
                const displayName = target.isStage ? v.name : `${target.getName()}:${v.name}`;
                const data = { id: v.id, name: v.name };
                if (v.type === 'list') lists.push({ displayName, data });
                else variables.push({ displayName, data });
            }
        });
        const sortFn = (a, b) => a.displayName.localeCompare(b.displayName);
        variables.sort(sortFn);
        lists.sort(sortFn);
        return { variables, lists };
    }

    function parseBlockPrimitives(fileContent) {
        const primitivesRegex = /getPrimitives\s*\(\)\s*\{[^}]*return\s*\{([^}]+)\}/s;
        const primitivesMatch = fileContent.match(primitivesRegex);
        if (!primitivesMatch) return alert("Could not find getPrimitives() block in the file.");
        const primitivesStr = primitivesMatch[1];
        const opcodeFunctionRegex = /(\w+):\s*this\.(\w+)/g;
        let match;
        const newDefinitions = {};
        while ((match = opcodeFunctionRegex.exec(primitivesStr)) !== null) {
            const [_, opcode, functionName] = match;
            const functionBodyRegex = new RegExp(`${functionName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`, 's');
            const bodyMatch = fileContent.match(functionBodyRegex);
            if (bodyMatch) {
                const argsRegex = /args\.(\w+)/g;
                const argsInBody = new Set();
                let argMatch;
                while((argMatch = argsRegex.exec(bodyMatch[1])) !== null) argsInBody.add(argMatch[1]);
                newDefinitions[opcode] = Array.from(argsInBody);
            }
        }
        Object.assign(hack.importedDefinitions, newDefinitions);
        alert("Successfully parsed and cached " + Object.keys(newDefinitions).length + " new block definitions.");
    }

    function getOpcodeArgs(opcode) {
        return hack.importedDefinitions[opcode] || [];
    }

    // --- Create floating panel with new structure ---
    const panel = document.createElement("div");
    panel.style.cssText = `position:fixed;top:10px;right:10px;z-index:99999;background:#222;color:white;padding:10px;font-family:sans-serif;font-size:14px;border:1px solid #555;border-radius:8px;max-width:300px;`;
    panel.innerHTML = `
        <div id="hackHeader" style="font-weight:bold;cursor:move;background:#333;padding:4px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;">
            <span>Scratch Opcode Runner</span>
            <span id="hackCollapse" style="cursor:pointer;padding:0 6px;font-family:monospace;">[–]</span>
        </div>
        <div id="hackBody">
            <button id="hackImport" style="margin-top:5px;width:100%;background:#444;border:1px solid #666;color:white;padding:4px;border-radius:4px;">Import Definitions</button>
            <div style="margin-top:5px;"><label>Sprite:</label><br><select id="hackSprite"></select></div>
            <div style="margin-top:5px;"><label>Opcode:</label><br><select id="hackOpcode"></select></div>
            <div id="hackInputs" style="margin-top:5px;"></div>
            <button id="hackRun" style="margin-top:5px;width:100%;">Run</button>
        </div>
    `;
    document.body.appendChild(panel);
    
    const opcodeSelect = panel.querySelector("#hackOpcode");
    const inputContainer = panel.querySelector("#hackInputs");

    function populateOpcodes() {
        opcodeSelect.innerHTML = '';
        const availableOpcodes = Object.keys(hack.importedDefinitions).sort();
        if (availableOpcodes.length === 0) {
            const opt = new Option("Import definitions to begin...", "", true, true);
            opt.disabled = true;
            opcodeSelect.add(opt);
        } else {
            availableOpcodes.forEach(op => {
                if (vm.runtime._primitives[op]) opcodeSelect.add(new Option(op, op));
            });
        }
        opcodeSelect.dispatchEvent(new Event("change"));
    }

    panel.querySelector("#hackImport").onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = res => {
                try {
                    parseBlockPrimitives(res.target.result);
                    populateOpcodes();
                } catch (err) { alert("Failed to parse file: " + err); }
            };
            reader.onerror = err => alert("Error reading file: " + err);
            reader.readAsText(file);
        };
        input.click();
    };

    // --- (NEW) Make Draggable and Collapsible ---
    (function makeInteractive() {
        const header = panel.querySelector("#hackHeader");
        const collapseBtn = panel.querySelector("#hackCollapse");
        const body = panel.querySelector("#hackBody");
        let isCollapsed = false;
        let offsetX = 0, offsetY = 0, down = false;

        header.onmousedown = e => {
            // Don't start drag if clicking the collapse button
            if (e.target === collapseBtn) return;
            down = true;
            offsetX = e.clientX - panel.offsetLeft;
            offsetY = e.clientY - panel.offsetTop;
        };

        document.onmousemove = e => {
            if (!down) return;
            panel.style.left = e.clientX - offsetX + "px";
            panel.style.top = e.clientY - offsetY + "px";
            panel.style.right = "auto";
        };

        document.onmouseup = () => down = false;

        collapseBtn.onclick = () => {
            isCollapsed = !isCollapsed;
            body.style.display = isCollapsed ? 'none' : 'block';
            collapseBtn.textContent = isCollapsed ? '[+]' : '[–]';
        };
    })();

    const spriteSelect = panel.querySelector("#hackSprite");
    vm.runtime.targets.forEach(t => spriteSelect.add(new Option(t.getName(), t.getName())));

    opcodeSelect.addEventListener("change", () => {
        inputContainer.innerHTML = "";
        const args = getOpcodeArgs(opcodeSelect.value);
        if (!args.length) {
            inputContainer.innerHTML = `<i>No arguments for this opcode</i>`;
            return;
        }
        const { variables, lists } = getAllVarsAndLists();
        args.forEach(argName => {
            const wrap = document.createElement("div");
            wrap.style.marginTop = '4px';
            wrap.innerHTML = `<label>${argName}:</label><br>`;
            let el;
            if (argName === 'VARIABLE' || argName === 'LIST') {
                el = document.createElement('select');
                const source = argName === 'VARIABLE' ? variables : lists;
                if (source.length === 0) {
                    el.add(new Option(`No ${argName.toLowerCase()}s found`, '', true, true));
                    el.disabled = true;
                } else {
                    source.forEach(item => el.add(new Option(item.displayName, JSON.stringify(item.data))));
                }
            } else {
                el = document.createElement('input');
                el.type = 'text';
            }
            el.dataset.arg = argName;
            el.style.width = '100%';
            wrap.appendChild(el);
            inputContainer.appendChild(wrap);
        });
    });

    panel.querySelector("#hackRun").onclick = () => {
        const args = {};
        inputContainer.querySelectorAll("input, select").forEach(el => {
            const argName = el.dataset.arg;
            const val = el.value;
            if (el.tagName.toLowerCase() === 'select') {
                try { args[argName] = JSON.parse(val); } catch (e) { args[argName] = null; }
            } else {
                args[argName] = (val !== '' && !isNaN(val)) ? Number(val) : val;
            }
        });
        hack.runOpcode(spriteSelect.value, opcodeSelect.value, args);
    };

    populateOpcodes();
    console.log("Floating Scratch Opcode Runner loaded. It is draggable and collapsible. See window.hack");
})();
