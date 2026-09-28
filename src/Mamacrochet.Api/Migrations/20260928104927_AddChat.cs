using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mamacrochet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChatThreadReads",
                columns: table => new
                {
                    ThreadId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    UserId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    LastReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatThreadReads", x => new { x.ThreadId, x.UserId });
                });

            migrationBuilder.CreateTable(
                name: "ChatThreads",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OrderId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CustomerId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    GuestId = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: true),
                    AssignedEmployeeId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsClosed = table.Column<bool>(type: "boolean", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastMessageAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatThreads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatThreads_AspNetUsers_AssignedEmployeeId",
                        column: x => x.AssignedEmployeeId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ChatThreads_AspNetUsers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ChatThreads_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ChatMessages",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ThreadId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SenderId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    SenderGuestId = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: true),
                    SenderName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SenderRole = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Body = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    ProductId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ProductName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatMessages_AspNetUsers_SenderId",
                        column: x => x.SenderId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_ChatMessages_ChatThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "ChatThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChatAttachments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ThreadId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    MessageId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    StoredName = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    OriginalName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Bytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChatAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChatAttachments_ChatMessages_MessageId",
                        column: x => x.MessageId,
                        principalTable: "ChatMessages",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ChatAttachments_ChatThreads_ThreadId",
                        column: x => x.ThreadId,
                        principalTable: "ChatThreads",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ChatAttachments_MessageId",
                table: "ChatAttachments",
                column: "MessageId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatAttachments_ThreadId_MessageId",
                table: "ChatAttachments",
                columns: new[] { "ThreadId", "MessageId" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_SenderId",
                table: "ChatMessages",
                column: "SenderId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_ThreadId_At",
                table: "ChatMessages",
                columns: new[] { "ThreadId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatThreads_AssignedEmployeeId",
                table: "ChatThreads",
                column: "AssignedEmployeeId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatThreads_CustomerId",
                table: "ChatThreads",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatThreads_GuestId_Kind",
                table: "ChatThreads",
                columns: new[] { "GuestId", "Kind" },
                unique: true,
                filter: "\"Kind\" = 'visitor' AND NOT \"IsClosed\"");

            migrationBuilder.CreateIndex(
                name: "IX_ChatThreads_Kind_IsClosed_LastMessageAt",
                table: "ChatThreads",
                columns: new[] { "Kind", "IsClosed", "LastMessageAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatThreads_OrderId",
                table: "ChatThreads",
                column: "OrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChatAttachments");

            migrationBuilder.DropTable(
                name: "ChatThreadReads");

            migrationBuilder.DropTable(
                name: "ChatMessages");

            migrationBuilder.DropTable(
                name: "ChatThreads");
        }
    }
}
