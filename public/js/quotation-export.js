document.addEventListener('DOMContentLoaded', () => {
    const printArea = document.getElementById('quotationPrintArea');
    const savePdfBtn = document.getElementById('quotationSavePdf');
    const saveImageBtn = document.getElementById('quotationSaveImage');
    if (!printArea) return;

    const fileBaseName = () => `quotation-${printArea.dataset.quotationNumber || Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '');

    async function captureCanvas() {
        return window.html2canvas(printArea, { scale: 2, backgroundColor: '#ffffff' });
    }

    function setBusy(btn, busy) {
        if (!btn) return;
        btn.disabled = busy;
        btn.classList.toggle('is-busy', busy);
    }

    if (saveImageBtn) {
        saveImageBtn.addEventListener('click', async () => {
            setBusy(saveImageBtn, true);
            try {
                const canvas = await captureCanvas();
                canvas.toBlob((blob) => {
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${fileBaseName()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                }, 'image/png');
            } finally {
                setBusy(saveImageBtn, false);
            }
        });
    }

    if (savePdfBtn) {
        savePdfBtn.addEventListener('click', async () => {
            setBusy(savePdfBtn, true);
            try {
                const canvas = await captureCanvas();
                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();
                const imgWidth = pageWidth;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                const finalHeight = Math.min(imgHeight, pageHeight);
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, finalHeight);
                pdf.save(`${fileBaseName()}.pdf`);
            } finally {
                setBusy(savePdfBtn, false);
            }
        });
    }
});
