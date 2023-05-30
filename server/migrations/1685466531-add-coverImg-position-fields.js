module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("documents", "coverImgPositionX", {
      type: "DOUBLE",
      allowNull: true,
    });
    await queryInterface.addColumn("documents", "coverImgPositionY", {
      type: "DOUBLE",
      allowNull: true,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("documents", "coverImgPositionX");
    await queryInterface.removeColumn("documents", "coverImgPositionY");
  },
};
