// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let currentFile = null;
let fileList = [];
let pdfDoc = null;

function createFileTree(files) {
    const tree = {};
    files.forEach(file => {
        const parts = file.webkitRelativePath.split('/');
        let current = tree;
        parts.forEach((part, i) => {
            if (i === parts.length - 1) {
                if (part.match(/\.(mp4|webm|pdf|html|srt)$/i)) {
                    current[part] = file;
                }
            } else {
                current[part] = current[part] || {};
                current = current[part];
            }
        });
    });
    return tree;
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    switch(ext) {
        case 'mp4':
        case 'webm':
            return 'fa-play-circle';
        case 'pdf':
            return 'fa-file-pdf';
        case 'html':
            return 'fa-file-code';
        default:
            return 'fa-file';
    }
}

function renderTree(container, structure, path = '') {
    for (const [name, content] of Object.entries(structure)) {
        if (content instanceof File) {
            const file = document.createElement('div');
            file.className = 'file';
            file.innerHTML = `
                <div class="file-icon">
                    <i class="fas ${getFileIcon(name)}"></i>
                </div>
                <span>${name}</span>
            `;
            file.onclick = () => openFile(content);
            container.appendChild(file);
            fileList.push(content);
        } else {
            const folder = document.createElement('div');
            folder.className = 'folder';
            const header = document.createElement('div');
            header.className = 'folder-header';
            header.innerHTML = `
                <i class="fas fa-folder"></i>
                <span>${name}</span>
            `;
            const content_div = document.createElement('div');
            content_div.className = 'folder-content';
            
            header.onclick = () => {
                folder.classList.toggle('open');
                header.querySelector('i').classList.toggle('fa-folder');
                header.querySelector('i').classList.toggle('fa-folder-open');
            };
            
            folder.appendChild(header);
            folder.appendChild(content_div);
            container.appendChild(folder);
            renderTree(content_div, content, path + '/' + name);
        }
    }
}

async function openFile(file) {
    const url = URL.createObjectURL(file);
    const viewer = document.getElementById('viewer');
    const ext = file.name.split('.').pop().toLowerCase();
    
    switch(ext) {
        case 'mp4':
        case 'webm':
            const videoBaseName = file.name.replace(/\.(mp4|webm)$/, '');
            const videoDir = file.webkitRelativePath.split('/').slice(0, -1).join('/');
            
            const srtFile = fileList.find(f => {
                const isSameDir = f.webkitRelativePath.startsWith(videoDir);
                const isSrtFile = f.name.endsWith('.srt');
                const matchesVideo = f.name.startsWith(videoBaseName);
                return isSameDir && isSrtFile && matchesVideo;
            });

            viewer.innerHTML = `
                <video id="player" controls>
                    <source src="${url}" type="video/${ext}">
                    ${srtFile ? `<track label="Subtitles" kind="subtitles" srclang="en" src="${URL.createObjectURL(srtFile)}" default>` : ''}
                </video>
                <div id="transcript" class="transcript"></div>
            `;
            
            const player = document.getElementById('player');
            player.playbackRate = document.getElementById('playbackSpeed').value;

            if (srtFile) {
                const response = await fetch(URL.createObjectURL(srtFile));
                const text = await response.text();
                const transcript = document.getElementById('transcript');
                transcript.innerText = text.replace(/\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/g, '');
            }
            
            player.play();
            break;
        
        case 'pdf':
            viewer.innerHTML = '<div class="pdf-container" id="pdfContainer"></div>';
            const loadingTask = pdfjsLib.getDocument(url);
            pdfDoc = await loadingTask.promise;
            renderPdfPage(1);
            break;
            
        case 'html':
            viewer.innerHTML = `<iframe src="${url}"></iframe>`;
            break;
    }
    
    currentFile = file;
    document.getElementById('path').textContent = file.webkitRelativePath;
    
    updateNavButtons();
    saveProgress();
    highlightCurrent();
}

async function renderPdfPage(pageNumber) {
    const page = await pdfDoc.getPage(pageNumber);
    const canvas = document.createElement('canvas');
    const container = document.getElementById('pdfContainer');
    const scale = 1.5;
    
    const viewport = page.getViewport({ scale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const context = canvas.getContext('2d');
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    
    container.innerHTML = '';
    container.appendChild(canvas);
    await page.render(renderContext);
}

function updateNavButtons() {
    const index = fileList.indexOf(currentFile);
    document.getElementById('prev').disabled = index <= 0;
    document.getElementById('next').disabled = index >= fileList.length - 1;
}

function highlightCurrent() {
    document.querySelectorAll('.file').forEach(f => f.classList.remove('active'));
    const files = document.querySelectorAll('.file');
    const index = fileList.indexOf(currentFile);
    files[index]?.classList.add('active');
}

function saveProgress() {
    const progress = {};
    const player = document.getElementById('player');
    if (player) {
        progress[currentFile.webkitRelativePath] = player.currentTime;
    }
    localStorage.setItem('videoProgress', JSON.stringify(progress));
}

function loadProgress() {
    return JSON.parse(localStorage.getItem('videoProgress') || '{}');
}

// Event Listeners
document.getElementById('playbackSpeed').onchange = (e) => {
    const player = document.getElementById('player');
    if (player) {
        player.playbackRate = e.target.value;
    }
};

document.getElementById('prev').onclick = () => {
    const index = fileList.indexOf(currentFile);
    if (index > 0) openFile(fileList[index - 1]);
};

document.getElementById('next').onclick = () => {
    const index = fileList.indexOf(currentFile);
    if (index < fileList.length - 1) openFile(fileList[index + 1]);
};

document.getElementById('darkMode').onchange = (e) => {
    document.body.classList.toggle('dark-mode', e.target.checked);
};

document.getElementById('fullscreen').onclick = () => {
    const viewer = document.getElementById('viewer');
    if (viewer.requestFullscreen) {
        viewer.requestFullscreen();
    } else if (viewer.webkitRequestFullscreen) {
        viewer.webkitRequestFullscreen();
    }
};

// Video progress tracking
document.addEventListener('timeupdate', (e) => {
    if (e.target.tagName === 'VIDEO') {
        const player = e.target;
        const progress = (player.currentTime / player.duration) * 100;
        document.querySelector('.progress-bar').style.width = `${progress}%`;
        saveProgress();
    }
}, true);

document.addEventListener('ended', (e) => {
    if (e.target.tagName === 'VIDEO' && document.getElementById('autoplay').checked) {
        document.getElementById('next').click();
    }
}, true);

document.getElementById('search').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.file').forEach(file => {
        const visible = file.textContent.toLowerCase().includes(term);
        file.style.display = visible ? 'flex' : 'none';
        
        // Show parent folders of matching files
        let parent = file.parentElement;
        while (parent && parent.classList.contains('folder-content')) {
            parent.parentElement.style.display = visible ? 'block' : null;
            if (visible) parent.parentElement.classList.add('open');
            parent = parent.parentElement.parentElement;
        }
    });
};

// Drag and drop functionality
const dropZone = document.body;

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.opacity = '0.5';
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.opacity = '1';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.opacity = '1';
    
    const items = e.dataTransfer.items;
    if (items) {
        const files = [];
        let totalFiles = 0;
        let processedFiles = 0;
        
        function processEntry(entry) {
            if (entry.isFile) {
                entry.file(file => {
                    files.push(file);
                    processedFiles++;
                    if (processedFiles === totalFiles) {
                        const tree = createFileTree(files);
                        const container = document.getElementById('fileTree');
                        container.innerHTML = '';
                        renderTree(container, tree);
                    }
                });
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                reader.readEntries(entries => {
                    entries.forEach(processEntry);
                });
            }
        }
        
        function countFiles(entry) {
            if (entry.isFile) {
                totalFiles++;
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                reader.readEntries(entries => {
                    entries.forEach(countFiles);
                });
            }
        }
        
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry();
            if (entry) {
                countFiles(entry);
                processEntry(entry);
            }
        }
    }
});

// Add button for manual folder selection
const selectButton = document.createElement('button');
selectButton.innerHTML = '<i class="fas fa-folder-open"></i> Select Course Folder';
selectButton.style.margin = '1rem';
document.getElementById('fileTree').before(selectButton);

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.webkitdirectory = true;

selectButton.onclick = () => {
    fileInput.click();
};

fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    const tree = createFileTree(files);
    const container = document.getElementById('fileTree');
    container.innerHTML = '';
    renderTree(container, tree);
};

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    
    switch(e.key) {
        case ' ':
            e.preventDefault();
            const player = document.getElementById('player');
            if (player) {
                player.paused ? player.play() : player.pause();
            }
            break;
        case 'ArrowLeft':
            document.getElementById('prev').click();
            break;
        case 'ArrowRight':
            document.getElementById('next').click();
            break;
        case 'f':
            document.getElementById('fullscreen').click();
            break;
    }
});

// Sort function to handle numeric prefixes
function sortByPrefix(a, b) {
    const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0');
    const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0');
    return numA - numB;
}

// Update createFileTree function to sort by number prefix
function createFileTree(files) {
    const tree = {};
    files.forEach(file => {
        const parts = file.webkitRelativePath.split('/');
        let current = tree;
        parts.forEach((part, i) => {
            if (i === parts.length - 1) {
                if (part.match(/\.(mp4|webm|pdf|html)$/i)) {
                    current[part] = file;
                }
            } else {
                current[part] = current[part] || {};
                current = current[part];
            }
        });
    });

    // Recursively sort the tree
    function sortTree(obj) {
        const sorted = {};
        Object.keys(obj)
            .sort(sortByPrefix)
            .forEach(key => {
                sorted[key] = obj[key] instanceof File ? obj[key] : sortTree(obj[key]);
            });
        return sorted;
    }

    return sortTree(tree);
}

// Initialize resizable sidebar
function initResizableSidebar() {
    const mainContainer = document.querySelector('.main-container');
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content');
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    sidebar.appendChild(handle);

    let isResizing = false;
    let startX;
    let startWidth;

    // Add cursor styles during resize
    handle.addEventListener('mouseenter', () => {
        document.body.style.cursor = 'ew-resize';
    });

    handle.addEventListener('mouseleave', () => {
        if (!isResizing) {
            document.body.style.cursor = 'default';
        }
    });

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.getBoundingClientRect().width;
        
        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        
        // Add temporary overlay to prevent iframe interference
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.zIndex = '9999';
        document.body.appendChild(overlay);
        
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(startWidth + delta, window.innerWidth * 0.8));
            
            requestAnimationFrame(() => {
                sidebar.style.width = `${newWidth}px`;
                content.style.width = `calc(100% - ${newWidth}px)`;
            });
        };
        
        const handleMouseUp = () => {
            isResizing = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            overlay.remove();
            
            // Save sidebar width preference
            localStorage.setItem('sidebarWidth', sidebar.style.width);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    // Restore saved sidebar width
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        sidebar.style.width = savedWidth;
        content.style.width = `calc(100% - ${savedWidth})`;
    }
}

initResizableSidebar();












// -----------------------------
