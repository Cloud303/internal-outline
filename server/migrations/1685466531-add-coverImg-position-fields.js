module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("documents", "coverImgPositionX", {
      type: "DECIMAL",
      allowNull: true,
    });
    await queryInterface.addColumn("documents", "coverImgPositionY", {
      type: "DECIMAL",
      allowNull: true,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("documents", "coverImgPositionX");
    await queryInterface.removeColumn("documents", "coverImgPositionY");
  },
};
