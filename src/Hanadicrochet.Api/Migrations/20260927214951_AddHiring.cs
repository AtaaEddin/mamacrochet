using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hanadicrochet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHiring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "HiringApplications",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    NormalizedEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Country = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Nationality = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Languages = table.Column<string[]>(type: "text[]", nullable: false),
                    PreviousWork = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    AppliedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DecidedById = table.Column<string>(type: "text", nullable: true),
                    DecisionNote = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HiringApplications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HiringApplications_AspNetUsers_DecidedById",
                        column: x => x.DecidedById,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HiringApplicationEvents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ApplicationId = table.Column<string>(type: "character varying(32)", nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Note = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    ActorId = table.Column<string>(type: "text", nullable: true),
                    ActorName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    At = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HiringApplicationEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HiringApplicationEvents_HiringApplications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "HiringApplications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "HiringApplicationFiles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ApplicationId = table.Column<string>(type: "character varying(32)", nullable: false),
                    StoredName = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    OriginalName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HiringApplicationFiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HiringApplicationFiles_HiringApplications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "HiringApplications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_HiringApplicationEvents_ApplicationId_At",
                table: "HiringApplicationEvents",
                columns: new[] { "ApplicationId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_HiringApplicationFiles_ApplicationId",
                table: "HiringApplicationFiles",
                column: "ApplicationId");

            migrationBuilder.CreateIndex(
                name: "IX_HiringApplications_DecidedById",
                table: "HiringApplications",
                column: "DecidedById");

            migrationBuilder.CreateIndex(
                name: "IX_HiringApplications_NormalizedEmail",
                table: "HiringApplications",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HiringApplications_Status_AppliedAt",
                table: "HiringApplications",
                columns: new[] { "Status", "AppliedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HiringApplicationEvents");

            migrationBuilder.DropTable(
                name: "HiringApplicationFiles");

            migrationBuilder.DropTable(
                name: "HiringApplications");
        }
    }
}
