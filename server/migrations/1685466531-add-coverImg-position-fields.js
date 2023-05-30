module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("documents", "coverImgPositionX", {
      type: "TEXT",
      allowNull: true,
    });
    await queryInterface.addColumn("documents", "coverImgPositionY", {
      type: "TEXT",
      allowNull: true,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("documents", "coverImgPositionX");
    await queryInterface.removeColumn("documents", "coverImgPositionY");
  },
};
