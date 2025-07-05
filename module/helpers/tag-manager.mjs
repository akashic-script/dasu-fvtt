export class TagManager {
  static getAvailableTags() {
    return game.items.filter((item) => item.type === 'tag');
  }

  static async createTag(data) {
    const tagData = {
      name: data.name,
      type: 'tag',
      system: {
        description: data.description || '',
        rank: data.rank || 1,
        maxRank: data.maxRank || 1,
        price: data.price || 0,
      },
    };
    return await Item.create(tagData);
  }
}
