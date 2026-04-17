using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var projectRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, ".."));
var dbPath = Path.Combine(projectRoot, "database", "Ticket.db");

if (!File.Exists(dbPath))
{
    app.Logger.LogWarning("Database not found at {Path}. API will return errors until it exists.", dbPath);
}

app.MapGet("/api/tickets", () =>
{
    if (!File.Exists(dbPath))
        return Results.Problem("Database file missing.", statusCode: 500);

    using var conn = new SqliteConnection($"Data Source={dbPath}");
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText =
        """
        SELECT TicketID, TicketTitle, TicketStatus, DateCreated, LastUpdated
        FROM Ticket
        ORDER BY datetime(LastUpdated) DESC, TicketID DESC
        """;
    using var reader = cmd.ExecuteReader();
    var list = new List<TicketSummaryDto>();
    while (reader.Read())
    {
        var title = reader.GetString(1);
        list.Add(new TicketSummaryDto(
            reader.GetInt32(0),
            title,
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            TicketTopics.InferTopicKey(title)
        ));
    }

    return Results.Json(list);
});

app.MapGet("/api/tickets/{ticketId:int}", (int ticketId) =>
{
    if (!File.Exists(dbPath))
        return Results.Problem("Database file missing.", statusCode: 500);

    using var conn = new SqliteConnection($"Data Source={dbPath}");
    conn.Open();

    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText =
            """
            SELECT TicketID, TicketTitle, TicketStatus, DateCreated, LastUpdated
            FROM Ticket
            WHERE TicketID = $id
            """;
        cmd.Parameters.AddWithValue("$id", ticketId);
        using var reader = cmd.ExecuteReader();
        if (!reader.Read())
            return Results.NotFound();

        var title = reader.GetString(1);
        var summary = new TicketSummaryDto(
            reader.GetInt32(0),
            title,
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            TicketTopics.InferTopicKey(title)
        );

        reader.Close();

        var messages = new List<MessageDto>();
        using var cmdM = conn.CreateCommand();
        cmdM.CommandText =
            """
            SELECT MessageID, MessageContent, MessageSender, DateCreated
            FROM Messages
            WHERE TicketID = $id
            ORDER BY MessageID ASC
            """;
        cmdM.Parameters.AddWithValue("$id", ticketId);
        using var rm = cmdM.ExecuteReader();
        while (rm.Read())
        {
            var content = rm.GetString(1);
            var senderRaw = rm.GetString(2).Trim().ToLowerInvariant();
            var isUser = senderRaw == "user";
            var isHtml = !isUser && content.Contains('<', StringComparison.Ordinal);
            messages.Add(new MessageDto(
                rm.GetInt32(0),
                isUser ? "user" : "staff",
                isHtml,
                content,
                rm.GetString(3)
            ));
        }

        return Results.Json(new TicketDetailDto(summary, messages));
    }
});

app.MapPost("/api/tickets/{ticketId:int}/messages", (int ticketId, [FromBody] AddMessageDto? body) =>
{
    try
    {
        if (!File.Exists(dbPath))
            return Results.Problem("Database file missing.", statusCode: 500);

        if (body is null || string.IsNullOrWhiteSpace(body.Content))
            return Results.BadRequest(new { error = "Message is required." });

        var trimmed = body.Content.Trim();

        using var conn = new SqliteConnection($"Data Source={dbPath}");
        conn.Open();

        using (var existsCmd = conn.CreateCommand())
        {
            existsCmd.CommandText = "SELECT 1 FROM Ticket WHERE TicketID = $id LIMIT 1;";
            existsCmd.Parameters.AddWithValue("$id", ticketId);
            var exists = existsCmd.ExecuteScalar() is not null;
            if (!exists)
                return Results.NotFound();
        }

        var now = DateTime.UtcNow.ToString("o");
        using var tx = conn.BeginTransaction();

        using (var insertCmd = conn.CreateCommand())
        {
            insertCmd.Transaction = tx;
            insertCmd.CommandText =
                """
                INSERT INTO Messages (TicketID, MessageContent, MessageSender, DateCreated)
                VALUES ($tid, $msg, $sender, $c)
                """;
            insertCmd.Parameters.AddWithValue("$tid", ticketId);
            insertCmd.Parameters.AddWithValue("$msg", trimmed);
            insertCmd.Parameters.AddWithValue("$sender", "user");
            insertCmd.Parameters.AddWithValue("$c", now);
            insertCmd.ExecuteNonQuery();
        }

        using (var updateCmd = conn.CreateCommand())
        {
            updateCmd.Transaction = tx;
            updateCmd.CommandText =
                """
                UPDATE Ticket
                SET LastUpdated = $u,
                    TicketStatus = CASE
                        WHEN LOWER(TRIM(COALESCE(TicketStatus, ''))) = 'closed' THEN 'Open'
                        ELSE TicketStatus
                    END
                WHERE TicketID = $tid
                """;
            updateCmd.Parameters.AddWithValue("$u", now);
            updateCmd.Parameters.AddWithValue("$tid", ticketId);
            updateCmd.ExecuteNonQuery();
        }

        tx.Commit();
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Add ticket message failed");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/staff/tickets/{ticketId:int}/close", (int ticketId) =>
{
    try
    {
        if (!File.Exists(dbPath))
            return Results.Problem("Database file missing.", statusCode: 500);

        var now = DateTime.UtcNow.ToString("o");
        using var conn = new SqliteConnection($"Data Source={dbPath}");
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText =
            """
            UPDATE Ticket
            SET TicketStatus = $status, LastUpdated = $u
            WHERE TicketID = $id
            """;
        cmd.Parameters.AddWithValue("$status", "Closed");
        cmd.Parameters.AddWithValue("$u", now);
        cmd.Parameters.AddWithValue("$id", ticketId);
        var n = cmd.ExecuteNonQuery();
        if (n == 0)
            return Results.NotFound();

        return Results.NoContent();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Close ticket failed");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/staff/tickets/{ticketId:int}/messages", (int ticketId, [FromBody] AddMessageDto? body) =>
{
    try
    {
        if (!File.Exists(dbPath))
            return Results.Problem("Database file missing.", statusCode: 500);

        if (body is null || string.IsNullOrWhiteSpace(body.Content))
            return Results.BadRequest(new { error = "Message is required." });

        var trimmed = body.Content.Trim();

        using var conn = new SqliteConnection($"Data Source={dbPath}");
        conn.Open();

        using (var existsCmd = conn.CreateCommand())
        {
            existsCmd.CommandText = "SELECT 1 FROM Ticket WHERE TicketID = $id LIMIT 1;";
            existsCmd.Parameters.AddWithValue("$id", ticketId);
            var exists = existsCmd.ExecuteScalar() is not null;
            if (!exists)
                return Results.NotFound();
        }

        var now = DateTime.UtcNow.ToString("o");
        using var tx = conn.BeginTransaction();

        using (var insertCmd = conn.CreateCommand())
        {
            insertCmd.Transaction = tx;
            insertCmd.CommandText =
                """
                INSERT INTO Messages (TicketID, MessageContent, MessageSender, DateCreated)
                VALUES ($tid, $msg, $sender, $c)
                """;
            insertCmd.Parameters.AddWithValue("$tid", ticketId);
            insertCmd.Parameters.AddWithValue("$msg", trimmed);
            insertCmd.Parameters.AddWithValue("$sender", "staff");
            insertCmd.Parameters.AddWithValue("$c", now);
            insertCmd.ExecuteNonQuery();
        }

        using (var updateCmd = conn.CreateCommand())
        {
            updateCmd.Transaction = tx;
            updateCmd.CommandText = "UPDATE Ticket SET LastUpdated = $u WHERE TicketID = $tid;";
            updateCmd.Parameters.AddWithValue("$u", now);
            updateCmd.Parameters.AddWithValue("$tid", ticketId);
            updateCmd.ExecuteNonQuery();
        }

        tx.Commit();
        return Results.NoContent();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Add staff ticket message failed");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.MapPost("/api/tickets", ([FromBody] CreateTicketDto? body) =>
{
    try
    {
        if (!File.Exists(dbPath))
            return Results.Problem("Database file missing.", statusCode: 500);

        if (body is null || string.IsNullOrWhiteSpace(body.Description))
            return Results.BadRequest(new { error = "Description is required." });

        var topicKey = (body.TopicKey ?? "").Trim().ToLowerInvariant();
        if (topicKey is not ("ranking" or "recommendations" or "pricing" or "custom"))
            return Results.BadRequest(new { error = "Invalid topic." });

        string ticketTitle;
        if (topicKey == "custom")
        {
            if (string.IsNullOrWhiteSpace(body.CustomTitle))
                return Results.BadRequest(new { error = "Your question is required for custom topics." });
            ticketTitle = body.CustomTitle.Trim();
        }
        else
            ticketTitle = TicketTopics.Titles[topicKey];

        var now = DateTime.UtcNow.ToString("o");
        var userMessage = body.Description.Trim();
        var staffHtml = topicKey == "custom"
            ? TicketTopics.BuildStaffReplyCustomHtml(ticketTitle)
            : TicketTopics.BuildStaffReplyFaqHtml(topicKey);

        using var conn = new SqliteConnection($"Data Source={dbPath}");
        conn.Open();
        using var tx = conn.BeginTransaction();

        int newId;
        using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText =
                """
                INSERT INTO Ticket (TicketTitle, TicketStatus, DateCreated, LastUpdated)
                VALUES ($title, $status, $c, $u)
                """;
            cmd.Parameters.AddWithValue("$title", ticketTitle);
            cmd.Parameters.AddWithValue("$status", "Open");
            cmd.Parameters.AddWithValue("$c", now);
            cmd.Parameters.AddWithValue("$u", now);
            cmd.ExecuteNonQuery();
        }

        using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText = "SELECT TicketID FROM Ticket ORDER BY TicketID DESC LIMIT 1;";
            newId = Convert.ToInt32(cmd.ExecuteScalar()!, CultureInfo.InvariantCulture);
        }

        using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText =
                """
                INSERT INTO Messages (TicketID, MessageContent, MessageSender, DateCreated)
                VALUES ($tid, $msg, $sender, $c)
                """;
            cmd.Parameters.AddWithValue("$tid", newId);
            cmd.Parameters.AddWithValue("$msg", userMessage);
            cmd.Parameters.AddWithValue("$sender", "user");
            cmd.Parameters.AddWithValue("$c", now);
            cmd.ExecuteNonQuery();
        }

        using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = tx;
            cmd.CommandText =
                """
                INSERT INTO Messages (TicketID, MessageContent, MessageSender, DateCreated)
                VALUES ($tid, $msg, $sender, $c)
                """;
            cmd.Parameters.AddWithValue("$tid", newId);
            cmd.Parameters.AddWithValue("$msg", staffHtml);
            cmd.Parameters.AddWithValue("$sender", "staff");
            cmd.Parameters.AddWithValue("$c", now);
            cmd.ExecuteNonQuery();
        }

        tx.Commit();

        return Results.Json(new CreateTicketResponse(newId), statusCode: StatusCodes.Status201Created);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Create ticket failed");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

var staticFilesOptions = new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(projectRoot),
    RequestPath = ""
};

app.UseDefaultFiles(new DefaultFilesOptions
{
    FileProvider = new PhysicalFileProvider(projectRoot),
    RequestPath = ""
});
app.UseStaticFiles(staticFilesOptions);

app.Run();

internal static class TicketTopics
{
    public static readonly Dictionary<string, string> Titles = new()
    {
        ["ranking"] =
            "Why are my listings ranked lower than other listings similar to me?",
        ["recommendations"] =
            "Why am I being recommended more expensive listings when there are similar ones at a lower price?",
        ["pricing"] =
            "Why are the pricing suggestions always lower than what I expected?",
    };

    public static string InferTopicKey(string ticketTitle)
    {
        foreach (var kv in Titles)
        {
            if (string.Equals(kv.Value, ticketTitle, StringComparison.Ordinal))
                return kv.Key;
        }

        return "custom";
    }

    public static string BuildStaffReplyFaqHtml(string topicKey)
    {
        var sb = new StringBuilder();
        sb.Append("<p>Thanks for reaching out. We’ve published a detailed explanation in our FAQ that may address your question:</p>");
        sb.Append("<p><a class=\"ticket-inline-link\" href=\"faq.html#");
        sb.Append(topicKey);
        sb.Append("\">Open this topic in the FAQ</a></p>");
        sb.Append("<p>If that page wasn’t helpful, reply with what you still need and we’ll follow up with more specific information.</p>");
        return sb.ToString();
    }

    public static string BuildStaffReplyCustomHtml(string customTitle)
    {
        var safeTopic = WebUtility.HtmlEncode(customTitle);
        return
            "<p class=\"ticket-msg-sub\">Topic: " + safeTopic + "</p>" +
            "<p>Thank you for contacting RentIS. We’ve received your request and a staff member is reviewing it. " +
            "You’ll see updates in this thread as we work on it.</p>";
    }
}

internal record AddMessageDto(string Content);

internal record CreateTicketDto(string TopicKey, string? CustomTitle, string Description);

internal record CreateTicketResponse(int TicketId);

internal record TicketSummaryDto(
    int TicketId,
    string TicketTitle,
    string TicketStatus,
    string DateCreated,
    string LastUpdated,
    string TopicKey
);

internal record MessageDto(int MessageId, string From, bool IsHtml, string Content, string DateCreated);

internal record TicketDetailDto(TicketSummaryDto Ticket, List<MessageDto> Messages);
