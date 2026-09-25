using System.Globalization;
using System.Text.Json.Serialization;
using System.Windows;

namespace HajatManager.Models;

// Cermin mobile/lib/models/models.dart + kontrak app/api (camelCase JSON).
public sealed class EventModel
{
    public string Id { get; set; } = "";
    public string NamaAcara { get; set; } = "";
    public string? NamaTuanRumah { get; set; }
    public DateTime Tanggal { get; set; } = DateTime.Now;
    public string? Lokasi { get; set; }
    public string? Catatan { get; set; }
    public List<string> MejaList { get; set; } = new() { "MEJA-1", "MEJA-2" };
    public string MyRole { get; set; } = "VIEWER";
    public bool CanEdit => MyRole is "OWNER" or "ADMIN";
    public bool IsOwner => MyRole == "OWNER";
    public int TotalTamu { get; set; }
    public long TotalNominal { get; set; }

    // ---- Properti tampilan kartu EventsView (Task 3, cermin /dashboard web) ----
    // Format id-ID deterministik: "Sep" / "14 September 2026" (bukan kultur OS).
    private static readonly CultureInfo IdCulture = new("id-ID");

    // → "Sep"
    [JsonIgnore]
    public string TanggalBulan => Tanggal.ToString("MMM", IdCulture);

    // → "14 September 2026"
    [JsonIgnore]
    public string TanggalPanjang => Tanggal.ToString("d MMMM yyyy", IdCulture);

    // → "Tuan rumah: Budi" atau "" (web hanya render bila ada)
    [JsonIgnore]
    public string TuanRumahLabel =>
        string.IsNullOrWhiteSpace(NamaTuanRumah) ? "" : $"Tuan rumah: {NamaTuanRumah}";

    [JsonIgnore]
    public Visibility TuanRumahVisible =>
        string.IsNullOrWhiteSpace(NamaTuanRumah) ? Visibility.Collapsed : Visibility.Visible;

    // → "📍 Lokasi" atau ""
    [JsonIgnore]
    public string LokasiLabel =>
        string.IsNullOrWhiteSpace(Lokasi) ? "" : $"📍 {Lokasi}";

    [JsonIgnore]
    public Visibility LokasiVisible =>
        string.IsNullOrWhiteSpace(Lokasi) ? Visibility.Collapsed : Visibility.Visible;
}

public sealed class GuestBookModel
{
    public string Id { get; set; } = "";
    public string EventId { get; set; } = "";
    public string Nama { get; set; } = "";
    public string Alamat { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    // Kunci idempoten — cermin Guest.localId server (migrasi 20260920000000_add_local_id).
    // Id lokal awal == LocalId (UUID); setelah sync diganti server-CUID via rekonsiliasi.
    [JsonPropertyName("localId")]
    public string? LocalId { get; set; }
}

public sealed class GuestModel
{
    public string Id { get; set; } = "";
    public string EventId { get; set; } = "";
    public string? GuestBookId { get; set; }
    public string Nama { get; set; } = "";
    public string Alamat { get; set; } = "";
    public long Nominal { get; set; }
    public string Metode { get; set; } = "AMPLOP";
    public string? Catatan { get; set; }
    public string? PetugasId { get; set; }
    public string? MejaLabel { get; set; }
    public string? KodeInput { get; set; }
    public string? DeviceId { get; set; }
    // Kunci idempoten — cermin Guest.localId server (migrasi 20260920000000_add_local_id).
    [JsonPropertyName("localId")]
    public string? LocalId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
}

public sealed class MemberModel
{
    public string UserId { get; set; } = "";
    public string Role { get; set; } = "VIEWER";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Username { get; set; }
    public string? Image { get; set; }
}

public sealed class UserModel
{
    public string Id { get; set; } = "";
    public string? Name { get; set; }
    public string Email { get; set; } = "";
    public string? Username { get; set; }
    public string? Image { get; set; }
}

// Operasi antrean offline — cermin OutboxAction Flutter.
public sealed class OutboxOp
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string EventId { get; set; } = "";
    public string Action { get; set; } = "";
    public string TableName { get; set; } = "";
    public string Payload { get; set; } = "{}";
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class NameAddrTop
{
    public string Label { get; set; } = "";
    public int Jumlah { get; set; }
}

public sealed class NominalTop
{
    public long Nominal { get; set; }
    public int Jumlah { get; set; }
}
