let images = [];

// Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const grid = document.getElementById('gridContainer');

// Drag & Drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault();
    dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    // Reset input to allow selecting the same file again if needed
    fileInput.value = '';
});

async function handleFiles(files) {
    if (!files || files.length === 0) return;
    
    // 1. Process all files in parallel (Fixes "only one image added" issue)
    const promises = Array.from(files)
        .filter(file => file.type.startsWith('image/'))
        .map(file => {
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => resolve({
                    id: Math.random().toString(36).substr(2, 9),
                    base64: e.target.result,
                    rotation: 0,
                    fileType: file.type
                });
                reader.readAsDataURL(file);
            });
        });
    
    const newImages = await Promise.all(promises);
    images = [...images, ...newImages];
    render();
}

function render() {
    grid.innerHTML = '';
    images.forEach(img => {
        const div = document.createElement('div');
        div.className = 'thumbnail';
        div.dataset.id = img.id;
        div.innerHTML = `
            <div class="img-box">
                <img src="${img.base64}" style="transform: rotate(${img.rotation}deg)">
            </div>
            <div class="controls">
                <button onclick="rotate('${img.id}')">↻</button>
                <button class="delete" onclick="remove('${img.id}')">✕</button>
            </div>
        `;
        grid.appendChild(div);
    });
    
    // Initialize Sortable
    new Sortable(grid, {
        animation: 150,
        onEnd: () => {
            const newOrder = Array.from(grid.children).map(c => c.dataset.id);
            images = newOrder.map(id => images.find(img => img.id === id));
        }
    });
}

// Actions
window.rotate = (id) => {
    const img = images.find(i => i.id === id);
    if (img) {
        img.rotation = (img.rotation + 90) % 360;
        render();
    }
};

window.remove = (id) => {
    images = images.filter(i => i.id !== id);
    render();
};

window.clearAll = () => {
    images = [];
    render();
};

// PDF Generation (Zero Margins / Mac Style)
window.generatePDF = async () => {
    if (images.length === 0) return alert("No images uploaded.");
    
    const btn = document.getElementById('downloadBtn');
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;
    
    try {
        const { jsPDF } = window.jspdf;
        // We do not set format here, we set it per page
        // Initialize with dummy values, we will discard/overwrite the first page logic momentarily
        // but easier to just create the doc based on the first image dimensions.
        
        let doc;
        
        for (let i = 0; i < images.length; i++) {
            const item = images[i];
            const imgObj = await loadImage(item.base64);
            
            // Handle Rotation logic for dimensions
            const isRotated = item.rotation % 180 !== 0;
            const finalWidth = isRotated ? imgObj.height : imgObj.width;
            const finalHeight = isRotated ? imgObj.width : imgObj.height;
            
            // 2. Create PDF Page exactly the size of the image (Zero Margins)
            if (i === 0) {
                // First page: Initialize document with these dimensions
                // unit: 'px' matches image dimensions 1:1
                doc = new jsPDF({
                    orientation: finalWidth > finalHeight ? 'l' : 'p',
                    unit: 'px',
                    format: [finalWidth, finalHeight],
                    hotfixes: ['px_scaling']
                });
            } else {
                // Subsequent pages: Add page with specific dimensions
                doc.addPage([finalWidth, finalHeight], finalWidth > finalHeight ? 'l' : 'p');
            }
            
            // 3. Add Image filling the entire page (0, 0 coordinates)
            if (item.rotation !== 0) {
                const rotatedData = await rotateBase64(imgObj, item.rotation);
                doc.addImage(rotatedData, 'JPEG', 0, 0, finalWidth, finalHeight);
            } else {
                doc.addImage(item.base64, 'JPEG', 0, 0, finalWidth, finalHeight);
            }
        }
        
        const name = document.getElementById('filenameInput').value || 'document';
        doc.save(`${name}.pdf`);
        
    } catch (e) {
        console.error(e);
        alert("Error generating PDF");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function rotateBase64(img, angle) {
    const canvas = document.createElement('canvas');
    if (angle % 180 !== 0) {
        canvas.width = img.height;
        canvas.height = img.width;
    } else {
        canvas.width = img.width;
        canvas.height = img.height;
    }
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return canvas.toDataURL('image/jpeg', 0.95);
}