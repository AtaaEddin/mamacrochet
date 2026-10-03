using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Hanadicrochet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddChatCustomerDeletedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CustomerDeletedAt",
                table: "ChatThreads",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomerDeletedAt",
                table: "ChatThreads");
        }
    }
}
