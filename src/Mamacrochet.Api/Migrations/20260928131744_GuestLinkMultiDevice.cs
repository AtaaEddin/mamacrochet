using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Mamacrochet.Api.Migrations
{
    /// <inheritdoc />
    public partial class GuestLinkMultiDevice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GuestAccountLinks_UserId",
                table: "GuestAccountLinks");

            migrationBuilder.CreateIndex(
                name: "IX_GuestAccountLinks_UserId",
                table: "GuestAccountLinks",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GuestAccountLinks_UserId",
                table: "GuestAccountLinks");

            migrationBuilder.CreateIndex(
                name: "IX_GuestAccountLinks_UserId",
                table: "GuestAccountLinks",
                column: "UserId",
                unique: true);
        }
    }
}
