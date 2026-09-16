using ClosedXML.Excel;
using HajatManager.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace HajatManager.Services;

// Export PDF/Excel offline dari SQLite — cermin exporter.dart.
// Header hijau #059669 + baris TOTAL, seperti web.
public static class Exporter
{
    public static string FormatRp(long v) => $"Rp{v:N0}".Replace(",", ".");

    public static void ExportPdf(string path, EventModel ev, List<GuestModel> guests)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var total = guests.Sum(g => g.Nominal);
        Document.Create(c =>
        {
            c.Page(p =>
            {
                p.Size(PageSizes.A4);
                p.Margin(36);
                p.Header().Row(r =>
                {
                    r.RelativeItem().Column(col =>
                    {
                        col.Item().Text(ev.NamaAcara).FontSize(18).Bold();
                        col.Item().Text($"{ev.NamaTuanRumah ?? ""} • {ev.Tanggal:dd MMM yyyy}")
                            .FontSize(10).FontColor(Colors.Grey.Darken2);
                    });
                });
                p.Content().Table(t =>
                {
                    t.ColumnsDefinition(d =>
                    {
                        d.ConstantColumn(28);
                        d.RelativeColumn(3);
                        d.RelativeColumn(2);
                        d.ConstantColumn(90);
                        d.ConstantColumn(70);
                    });
                    t.Header(h =>
                    {
                        h.Cell().Background("#059669").Padding(6).Text("#").FontColor(Colors.White).Bold();
                        h.Cell().Background("#059669").Padding(6).Text("Nama").FontColor(Colors.White).Bold();
                        h.Cell().Background("#059669").Padding(6).Text("Alamat").FontColor(Colors.White).Bold();
                        h.Cell().Background("#059669").Padding(6).Text("Nominal").FontColor(Colors.White).Bold();
                        h.Cell().Background("#059669").Padding(6).Text("Metode").FontColor(Colors.White).Bold();
                    });
                    var i = 0;
                    foreach (var g in guests)
                    {
                        i++;
                        t.Cell().Padding(5).Text(i.ToString());
                        t.Cell().Padding(5).Text(g.Nama);
                        t.Cell().Padding(5).Text(g.Alamat);
                        t.Cell().Padding(5).AlignRight().Text(FormatRp(g.Nominal));
                        t.Cell().Padding(5).Text(g.Metode);
                    }
                    t.Cell().Padding(6).Text("");
                    t.Cell().Padding(6).Text($"TOTAL ({guests.Count} tamu)").Bold();
                    t.Cell().Padding(6).Text("");
                    t.Cell().Padding(6).AlignRight().Text(FormatRp(total)).Bold();
                    t.Cell().Padding(6).Text("");
                });
                p.Footer().AlignRight().Text($"Hajat Manager • {DateTime.Now:dd-MM-yyyy HH:mm}")
                    .FontSize(9).FontColor(Colors.Grey.Darken2);
            });
        }).GeneratePdf(path);
    }

    public static void ExportXlsx(string path, EventModel ev, List<GuestModel> guests)
    {
        using var wb = new XLWorkbook();
        var ws = wb.Worksheets.Add("Pemberian");
        string[] head = { "No", "Nama", "Alamat", "Nominal", "Metode", "Catatan" };
        for (var i = 0; i < head.Length; i++)
        {
            var c = ws.Cell(1, i + 1);
            c.Value = head[i];
            c.Style.Font.Bold = true;
            c.Style.Fill.BackgroundColor = XLColor.FromHtml("#059669");
            c.Style.Font.FontColor = XLColor.White;
        }
        var r = 2;
        var no = 0;
        foreach (var g in guests)
        {
            no++;
            ws.Cell(r, 1).Value = no;
            ws.Cell(r, 2).Value = g.Nama;
            ws.Cell(r, 3).Value = g.Alamat;
            ws.Cell(r, 4).Value = g.Nominal;
            ws.Cell(r, 5).Value = g.Metode;
            ws.Cell(r, 6).Value = g.Catatan ?? "";
            r++;
        }
        ws.Cell(r, 2).Value = $"TOTAL ({guests.Count} tamu)";
        ws.Cell(r, 2).Style.Font.Bold = true;
        ws.Cell(r, 4).Value = guests.Sum(g => g.Nominal);
        ws.Cell(r, 4).Style.Font.Bold = true;
        ws.Columns().AdjustToContents();
        wb.SaveAs(path);
    }
}
