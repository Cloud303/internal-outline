module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn("documents", "coverImg", {
            type: "TEXT",
            allowNull: true,
        });
    },
    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn("documents", "coverImg");
    },
};