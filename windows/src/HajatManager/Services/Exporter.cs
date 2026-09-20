using ClosedXML.Excel;
using HajatManager.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace HajatManager.Services;

// Export PDF/Excel offline dari SQLite — cermin exporter.dart + web EventClient.
// Header hijau #059669 + baris TOTAL + Rincian per Metode + TTD 3 kolom.
public static class Exporter
{
    public static string FormatRp(long v) => $"Rp {v:N0}".Replace(",", ".");

    public static void ExportPdf(string path, EventModel ev, List<GuestModel> guests, string userName = "-", string? mejaLabel = null)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var total = guests.Sum(g => g.Nominal);
        var safeEvent = string.IsNullOrWhiteSpace(ev.NamaAcara) ? "Acara" : ev.NamaAcara.Trim();
        var safeUser = string.IsNullOrWhiteSpace(userName) ? "-" : userName.Trim();
        var title = $"{safeEvent} - Laporan Pemberian";
        var meta = $"{DateTime.Now:dd/MM/yyyy HH:mm} | {safeUser} | {guests.Count} tamu | {FormatRp(total)}";
        var byMetode = guests.GroupBy(g => string.IsNullOrEmpty(g.Metode) ? "-" : g.Metode)
            .Select(g => new { Metode = g.Key, Jumlah = g.Count(), Total = g.Sum(x => x.Nominal) })
            .OrderByDescending(x => x.Total).ToList();
        Document.Create(c =>
        {
            c.Page(p =>
            {
                p.Size(PageSizes.A4);
                p.Margin(36);
                p.Header().Column(col =>
                {
                    col.Item().Text(title).FontSize(11).Bold();
                    col.Item().Text(meta).FontSize(8).FontColor(Colors.Grey.Darken2);
                });
                p.Content().Column(col =>
                {
                    col.Item().Table(t =>
                    {
                        t.ColumnsDefinition(d =>
                        {
                            d.ConstantColumn(28);
                            d.RelativeColumn(3);
                            d.RelativeColumn(2);
                            d.ConstantColumn(64);
                            d.ConstantColumn(52);
                            d.ConstantColumn(44);
                            d.RelativeColumn(2);
                        });
                        t.Header(h =>
                        {
                            foreach (var head in new[] { "No", "Nama", "Alamat", "Nominal", "Metode", "Meja", "Catatan" })
                                h.Cell().Background("#059669").Padding(6).Text(head).FontColor(Colors.White).Bold().FontSize(8);
                        });
                        var i = 0;
                        foreach (var g in guests)
                        {
                            i++;
                            t.Cell().Padding(5).Text(i.ToString()).FontSize(7);
                            t.Cell().Padding(5).Text(g.Nama).FontSize(7);
                            t.Cell().Padding(5).Text(g.Alamat).FontSize(7);
                            t.Cell().Padding(5).AlignRight().Text(FormatRp(g.Nominal)).FontSize(7);
                            t.Cell().Padding(5).Text(g.Metode ?? "-").FontSize(7);
                            t.Cell().Padding(5).Text(string.IsNullOrEmpty(g.MejaLabel) ? "-" : g.MejaLabel).FontSize(7);
                            t.Cell().Padding(5).Text(string.IsNullOrEmpty(g.Catatan) ? "-" : g.Catatan).FontSize(7);
                        }
                        t.Cell().Padding(6).Text("").FontSize(8);
                        t.Cell().Padding(6).Text("").FontSize(8);
                        t.Cell().Padding(6).Text("TOTAL").Bold().FontSize(8);
                        t.Cell().Padding(6).AlignRight().Text(FormatRp(total)).Bold().FontSize(8);
                        t.Cell().Padding(6).Text("").FontSize(8);
                        t.Cell().Padding(6).Text($"{guests.Count} tamu").Bold().FontSize(8);
                        t.Cell().Padding(6).Text("").FontSize(8);
                    });
                    // Rincian per Metode
                    col.Item().PaddingTop(12).Text("Rincian per Metode").FontSize(11).Bold();
                    col.Item().Text($"Total {guests.Count} catatan | {FormatRp(total)}").FontSize(7);
                    col.Item().Table(t =>
                    {
                        t.ColumnsDefinition(d =>
                        {
                            d.RelativeColumn(3);
                            d.ConstantColumn(60);
                            d.ConstantColumn(90);
                            d.ConstantColumn(60);
                        });
                        t.Header(h =>
                        {
                            foreach (var head in new[] { "Metode", "Jumlah", "Total", "Porsi" })
                                h.Cell().Background("#059669").Padding(6).Text(head).FontColor(Colors.White).Bold().FontSize(8);
                        });
                        foreach (var m in byMetode)
                        {
                            var porsi = total > 0 ? $"{(int)Math.Round(m.Total * 100.0 / total)}%" : "0%";
                            t.Cell().Padding(5).Text(m.Metode).FontSize(7);
                            t.Cell().Padding(5).AlignCenter().Text(m.Jumlah.ToString()).FontSize(7);
                            t.Cell().Padding(5).AlignRight().Text(FormatRp(m.Total)).FontSize(7);
                            t.Cell().Padding(5).AlignCenter().Text(porsi).FontSize(7);
                        }
                        t.Cell().Padding(6).Text("TOTAL").Bold().FontSize(8);
                        t.Cell().Padding(6).AlignCenter().Text(guests.Count.ToString()).Bold().FontSize(8);
                        t.Cell().Padding(6).AlignRight().Text(FormatRp(total)).Bold().FontSize(8);
                        t.Cell().Padding(6).AlignCenter().Text("100%").Bold().FontSize(8);
                    });
                    // Serah terima 3 kolom
                    col.Item().PaddingTop(12).LineHorizontal(0.5f).LineColor(Colors.Grey.Lighten2);
                    col.Item().Row(r =>
                    {
                        SignBlock(r.RelativeItem(), "Diserahkan oleh,", "Petugas/Admin", false);
                        SignBlock(r.RelativeItem(), "Diterima oleh,", "Owner/Tuan Rumah", false);
                        SignBlock(r.RelativeItem(), "Saksi,", "Nama (opsional)", true);
                    });
                });
                p.Footer().AlignRight().Text(t =>
                {
                    t.CurrentPageNumber().FontSize(7);
                    t.Span(" / ").FontSize(7);
                    t.TotalPages().FontSize(7);
                });
            });
        }).GeneratePdf(path);
    }

    private static void SignBlock(IContainer item, string title, string subtitle, bool optional)
    {
        item.Column(c =>
        {
            c.Item().Text(title).FontSize(7.5f).Bold();
            c.Item().Text(subtitle).FontSize(6.5f).Italic(optional);
            c.Item().PaddingTop(4);
            foreach (var label in new[] { "Nama", "Tanggal", "Tanda tangan" })
            {
                c.Item().Row(r =>
                {
                    r.ConstantItem(52).Text(label).FontSize(7);
                    r.RelativeItem().PaddingBottom(14).BorderBottom(0.5f).BorderColor(Colors.Grey.Medium);
                });
                c.Item().PaddingBottom(label == "Tanda tangan" ? 14 : 8);
            }
        });
    }

    public static void ExportXlsx(string path, EventModel ev, List<GuestModel> guests)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Rekap");
        var safeEvent = string.IsNullOrWhiteSpace(ev.NamaAcara) ? "Acara" : ev.NamaAcara.Trim();
        ws.Cell(1, 1).Value = safeEvent;
        ws.Cell(2, 1).Value = $"Laporan Pemberian | {DateTime.Now:dd/MM/yyyy HH:mm} | {guests.Count} tamu";
        string[] head = { "No", "Nama", "Alamat", "Nominal", "Metode", "Meja", "Catatan" };
        for (var i = 0; i < head.Length; i++)
        {
            var c = ws.Cell(4, i + 1);
            c.Value = head[i];
            c.Style.Font.Bold = true;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml("#059669");
            c.Style.Font.FontColor = XLColor.White;
        }
        var r = 5;
        var no = 0;
        foreach (var g in guests)
        {
            no++;
            ws.Cell(r, 1).Value = no;
            ws.Cell(r, 2).Value = g.Nama;
            ws.Cell(r, 3).Value = g.Alamat;
            ws.Cell(r, 4).Value = g.Nominal;
            ws.Cell(r, 5).Value = g.Metode;
            ws.Cell(r, 6).Value = string.IsNullOrEmpty(g.MejaLabel) ? "-" : g.MejaLabel;
            ws.Cell(r, 7).Value = g.Catatan ?? "-";
            r++;
        }
        ws.Cell(r, 2).Value = "TOTAL";
        ws.Cell(r, 2).Style.Font.Bold = true;
        ws.Cell(r, 4).Value = guests.Sum(g => g.Nominal);
        ws.Cell(r, 4).Style.Font.Bold = true;
        ws.Cell(r, 6).Value = $"{guests.Count} tamu";
        ws.Cell(r, 6).Style.Font.Bold = true;
        r++;
        // Rincian per Metode
        r++;
        ws.Cell(r, 1).Value = "Rincian per Metode";
        ws.Cell(r, 1).Style.Font.Bold = true;
        r++;
        foreach (var h in new[] { "Metode", "Jumlah", "Total", "Porsi%" })
        {
            var c = ws.Cell(r, Array.IndexOf(new[] { "Metode", "Jumlah", "Total", "Porsi%" }, h) + 1);
            c.Value = h;
            c.Style.Font.Bold = true;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml("#059669");
            c.Style.Font.FontColor = XLColor.White;
        }
        r++;
        var total = guests.Sum(g => g.Nominal);
        foreach (var m in guests.GroupBy(g => string.IsNullOrEmpty(g.Metode) ? "-" : g.Metode)
            .Select(g => new { Metode = g.Key, Jumlah = g.Count(), Total = g.Sum(x => x.Nominal) })
            .OrderByDescending(x => x.Total))
        {
            ws.Cell(r, 1).Value = m.Metode;
            ws.Cell(r, 2).Value = m.Jumlah;
            ws.Cell(r, 3).Value = m.Total;
            ws.Cell(r, 4).Value = total > 0 ? $"{(int)Math.Round(m.Total * 100.0 / total)}%" : "0%";
            r++;
        }
        ws.Cell(r, 1).Value = "TOTAL";
        ws.Cell(r, 1).Style.Font.Bold = true;
        ws.Cell(r, 2).Value = guests.Count;
        ws.Cell(r, 2).Style.Font.Bold = true;
        ws.Cell(r, 3).Value = total;
        ws.Cell(r, 3).Style.Font.Bold = true;
        ws.Cell(r, 4).Value = "100%";
        ws.Cell(r, 4).Style.Font.Bold = true;
        ws.Columns().AdjustToContents();
        wb.SaveAs(path);
    }
}
